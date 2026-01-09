from __future__ import annotations

import asyncio
import os
import platform
import subprocess
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List
from uuid import uuid4

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
    username: str = Field(..., min_length=1)
    year: int = Field(default=datetime.now().year, ge=2000, le=2100)
    games: List[Dict[str, Any]] = Field(default=[])

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
        if item.get("type") != 2:
            continue

        updated_at_str = item.get("updated_at")
        if not updated_at_str:
            continue
            
        try:
            updated_at = datetime.fromisoformat(updated_at_str.replace("Z", "+00:00"))
        except ValueError:
            continue

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
                image=images.get("common") or images.get("large") or images.get("medium") or "https://lain.bgm.tv/pic/cover/l/c5/c9/1_abcd1234.jpg",
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
        items_dict = [
            {
                "subject_id": entry.subject_id,
                "name": entry.name,
                "name_cn": entry.name_cn,
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

def _find_chrome_path() -> str:
    if platform.system() == "Windows":
        chrome_paths = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
        ]
        for path in chrome_paths:
            if os.path.exists(path):
                return path
    elif Path("/usr/bin/chromium").exists():
        return "/usr/bin/chromium"
    
    raise FileNotFoundError("Could not find Chrome/Chromium executable")

def _calculate_height(months: List[Dict[str, Any]]) -> int:
    estimated_height = 250
    for month in months:
        estimated_height += 24
        item_count = len(month['items'])
        rows = (item_count + 9) // 10
        estimated_height += rows * 312
    estimated_height += 150
    return estimated_height

async def render_image(username: str, year: int, months: List[Dict[str, Any]], total: int) -> bytes:
    template = env.get_template("report.html")
    html = template.render(
        username=username,
        year=year,
        total=total,
        months=months,
        generated_at=datetime.now(tz=tz.tzlocal()).strftime("%Y-%m-%d %H:%M"),
    )

    estimated_height = _calculate_height(months)
    loop = asyncio.get_running_loop()

    def _capture() -> bytes:
        temp_dir = BASE_DIR / "temp_images"
        temp_dir.mkdir(exist_ok=True)
        
        unique_id = uuid4().hex
        html_file = temp_dir / f"report-{unique_id}.html"
        image_file = temp_dir / f"report-{unique_id}.png"
        
        try:
            html_file.write_text(html, encoding="utf-8")
            chrome_path = _find_chrome_path()

            cmd = [
                chrome_path,
                "--headless",
                "--disable-gpu",
                "--no-sandbox",
                "--hide-scrollbars",
                "--virtual-time-budget=20000",
                "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                f"--screenshot={str(image_file.absolute())}",
                f"--window-size=1700,{estimated_height}",
                f"file:///{str(html_file.absolute()).replace(os.sep, '/')}"
            ]
            
            subprocess.run(cmd, check=True, timeout=40, capture_output=True, text=True)
            
            if not image_file.exists():
                raise FileNotFoundError(f"Failed to generate image: {image_file}")
                
            return image_file.read_bytes()
            
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"Chrome screenshot failed: {e.stderr}")
        finally:
            for file in [html_file, image_file]:
                if file.exists():
                    try:
                        file.unlink()
                    except:
                        pass

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

@app.post("/export-image")
async def export_image(payload: ExportRequest):
    if payload.games:
        raw_items = payload.games
    else:
        raw_items = await fetch_collections(payload.username)
            
    entries = transform_games(raw_items, payload.year)

    if not entries and not payload.games:
        raise HTTPException(status_code=404, detail=f"{payload.year} 年没有找到任何已完成的游戏")

    months = group_by_month(entries)
    image_bytes = await render_image(payload.username, payload.year, months, len(entries))
    filename = f"bangumi-{payload.username}-{payload.year}.png"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(content=image_bytes, media_type="image/png", headers=headers)
