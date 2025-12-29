from __future__ import annotations

import asyncio
import os
import platform
import subprocess
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

import httpx
from dateutil import tz
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from jinja2 import Environment, FileSystemLoader, select_autoescape
from pydantic import BaseModel, Field, validator

API_BASE = "https://api.bgm.tv/v0"
PAGE_SIZE = 30

BASE_DIR = Path(__file__).resolve().parent.parent
TEMPLATES_DIR = BASE_DIR / "templates"

env = Environment(
    loader=FileSystemLoader(TEMPLATES_DIR),
    autoescape=select_autoescape(["html", "xml"]),
)

app = FastAPI(title="Bangumi Annual Report Exporter")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ExportRequest(BaseModel):
    username: str = Field(..., min_length=1, description="Bangumi 用户名")
    year: int = Field(default=datetime.now().year, ge=2000, le=2100)
    games: List[Dict[str, Any]] = Field(default=[], description="前端传递的游戏列表，避免重复抓取")

    @validator("username")
    def strip_username(cls, value: str) -> str:
        return value.strip()

@dataclass
class GameEntry:
    subject_id: int
    name: str
    name_cn: str
    image: str
    updated_at: datetime
    score: int

async def fetch_collections(username: str) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    offset = 0

    async with httpx.AsyncClient(timeout=20.0) as client:
        while True:
            resp = await client.get(
                f"{API_BASE}/users/{username}/collections",
                params={
                    "subject_type": 4,
                    "limit": PAGE_SIZE,
                    "offset": offset,
                },
                headers={
                    "User-Agent": "bangumi-annual-exporter/1.0",
                },
            )

            if resp.status_code == 404:
                raise HTTPException(status_code=404, detail="找不到该用户，请确认 ID 是否正确")

            resp.raise_for_status()

            payload = resp.json()
            page_items = payload.get("data", [])
            items.extend(page_items)

            offset += PAGE_SIZE
            if offset >= payload.get("total", 0):
                break

    return items


def transform_games(raw_items: List[Dict[str, Any]], year: int) -> List[GameEntry]:
    entries: List[GameEntry] = []

    for item in raw_items:
        # 只保留 type===2（collect/玩过）
        if item.get("type") != 2:
            continue

        updated_at_str = item.get("updated_at")
        if not updated_at_str:
            continue
            
        try:
            updated_at = datetime.fromisoformat(updated_at_str.replace("Z", "+00:00"))
        except ValueError:
            continue

        # 如果有时区信息则转为本地，否则假设为 UTC
        if updated_at.tzinfo:
            updated_at = updated_at.astimezone(tz.tzlocal())
        
        if updated_at.year != year:
            continue

        subject = item.get("subject") or {}
        images = subject.get("images") or {}

        entries.append(
            GameEntry(
                subject_id=subject.get("id") or item.get("subject_id"),
                name=subject.get("name") or "",
                name_cn=subject.get("name_cn") or "",
                # 优先使用 common (中等尺寸) 以减小图片体积，原先是 large
                image=images.get("common")
                or images.get("large")
                or images.get("medium")
                or "https://lain.bgm.tv/pic/cover/l/c5/c9/1_abcd1234.jpg",
                updated_at=updated_at,
                score=subject.get("score") or 0,
            )
        )

    entries.sort(key=lambda e: e.updated_at, reverse=True)
    return entries


def group_by_month(entries: List[GameEntry]) -> List[Dict[str, Any]]:
    grouped: Dict[int, List[GameEntry]] = defaultdict(list)

    for entry in entries:
        grouped[entry.updated_at.month].append(entry)

    result = []
    for month in sorted(grouped.keys(), reverse=True):
        # 将 GameEntry 转换为字典，方便 Jinja2 模板访问
        items_dict = [
            {
                "subject_id": entry.subject_id,
                "name": entry.name,
                "name_cn": entry.name_cn,
                # Use local proxy to ensure stability and cache
                "image": f"http://127.0.0.1:8000/proxy/image?url={entry.image}",
                "updated_at": entry.updated_at,
                "updated_at_formatted": entry.updated_at.strftime("%m-%d"),
                "score": entry.score,
            }
            for entry in grouped[month]
        ]
        result.append(
            {
                "month": month,
                "label": f"{month:02d}",
                "items": items_dict,
            }
        )
    return result


async def render_image(username: str, year: int, months: List[Dict[str, Any]], total: int) -> bytes:
    template = env.get_template("report.html")
    html = template.render(
        username=username,
        year=year,
        total=total,
        months=months,
        generated_at=datetime.now(tz=tz.tzlocal()).strftime("%Y-%m-%d %H:%M"),
    )

    # 动态估算页面高度 - 适配新的 Compact Layout (1500px width)
    # Base:
    # Header: 36px(h1) + 8px + 18px(p) + 4px + 14px(time) + 32px(margin) = ~112px
    # Container Padding: 32px * 2 = 64px
    # Footer + margin: 32px + 12px = 44px
    # Total Base ~ 220px
    estimated_height = 250
    
    for month in months:
        # Month Block:
        # Label width is fixed 80px, doesn't affect height directly but grid gap does
        # Grid Gap (Months): 24px
        estimated_height += 24
        
        # Grid height is determined by rows
        item_count = len(month['items'])
        cols = 10
        rows = (item_count + cols - 1) // cols
        
        # Row Height:
        # Card Height: 300px
        # Grid Gap: 12px
        # Row Total = 312px
        estimated_height += rows * 312

    # Bottom Buffer:
    # Shadow (80px blur, 30px offset) -> Need ~110px
    # But new shadow is smaller: 0 30px 80px (container)
    # The container shadow is large.
    # Container shadow: 0 30px 80px.
    # Need at least 110px buffer.
    estimated_height += 150
    
    print(f"Calculated page height: {estimated_height}px")

    loop = asyncio.get_running_loop()

    def _capture() -> bytes:
        from uuid import uuid4
        
        # 使用当前目录下的 temp_images 文件夹
        temp_dir = BASE_DIR / "temp_images"
        temp_dir.mkdir(exist_ok=True)
        
        unique_id = uuid4().hex
        html_file = temp_dir / f"report-{unique_id}.html"
        image_file = temp_dir / f"report-{unique_id}.png"
        
        try:
            # 1. 保存 HTML 文件
            html_file.write_text(html, encoding="utf-8")
            
            # 2. 确定 Chrome 路径
            chrome_path = None
            if platform.system() == "Windows":
                chrome_paths = [
                    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
                    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
                ]
                for path in chrome_paths:
                    if os.path.exists(path):
                        chrome_path = path
                        break
            elif Path("/usr/bin/chromium").exists():
                chrome_path = "/usr/bin/chromium"
            
            if not chrome_path:
                raise FileNotFoundError("Could not find Chrome/Chromium executable")

            # 3. 构造命令
            cmd = [
                chrome_path,
                "--headless",
                "--disable-gpu",
                "--no-sandbox",
                "--hide-scrollbars",
                "--virtual-time-budget=20000", # Wait for images
                f"--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                f"--screenshot={str(image_file.absolute())}",
                f"--window-size=1700,{estimated_height}", # Window width 1700 to accommodate 1500px container + margins
                f"file:///{str(html_file.absolute()).replace(os.sep, '/')}"
            ]
            
            print(f"Executing: {' '.join(cmd)}")
            
            # 4. 执行命令
            subprocess.run(
                cmd, 
                check=True, 
                timeout=40, 
                capture_output=True, 
                text=True
            )
            
            # 5. 检查文件并返回
            if not image_file.exists():
                raise FileNotFoundError(f"Failed to generate image: {image_file}")
                
            return image_file.read_bytes()
            
        except subprocess.CalledProcessError as e:
            print(f"Chrome execution failed: {e.stderr}")
            raise RuntimeError(f"Chrome screenshot failed: {e.stderr}")
        finally:
            # 清理文件
            if html_file.exists():
                try: os.remove(html_file)
                except: pass
            if image_file.exists():
                try: os.remove(image_file)
                except: pass

    return await loop.run_in_executor(None, _capture)


@app.get("/")
async def root():
    return {"status": "ok", "message": "Bangumi Annual Report API"}


@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/proxy/image")
async def proxy_image(url: str):
    if not url.startswith("http"):
        raise HTTPException(400, "Invalid URL")

    async with httpx.AsyncClient() as client:
        try:
            req = await client.get(url)
            return StreamingResponse(
                req.aiter_bytes(), 
                media_type=req.headers.get("content-type"),
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "public, max-age=31536000"
                }
            )
        except Exception as e:
            raise HTTPException(500, str(e))

@app.post("/export-image", summary="生成年度报告图片")
async def export_image(payload: ExportRequest):
    try:
        # 如果前端提供了游戏数据，则直接使用，不再重新抓取
        if payload.games:
            print(f"Using {len(payload.games)} games from frontend payload")
            raw_items = payload.games
        else:
            print("Fetching games from Bangumi API...")
            raw_items = await fetch_collections(payload.username)
            
        entries = transform_games(raw_items, payload.year)

        if not entries:
            # 如果是前端传来的空数据，可能是因为确实没有2025年的游戏
            if payload.games: 
                 pass # Let it render empty or handle gracefully
            else:
                 raise HTTPException(status_code=404, detail=f"{payload.year} 年没有找到任何已完成的游戏")

        months = group_by_month(entries)
        image_bytes = await render_image(payload.username, payload.year, months, len(entries))
        filename = f"bangumi-{payload.username}-{payload.year}.png"
        headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
        return Response(content=image_bytes, media_type="image/png", headers=headers)
    except Exception as e:
        print(f"Error exporting image: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
