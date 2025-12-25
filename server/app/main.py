from __future__ import annotations

import asyncio
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

import httpx
from dateutil import tz
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from html2image import Html2Image
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

hti = Html2Image(
    browser="chromium",
    executable_path="/usr/bin/chromium",
    custom_flags=["--no-sandbox", "--disable-dev-shm-usage"],
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

        updated_at = datetime.fromisoformat(item["updated_at"].replace("Z", "+00:00"))
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
                image=images.get("large")
                or images.get("common")
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
        result.append(
            {
                "month": month,
                "label": f"{month:02d}",
                "items": grouped[month],
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

    loop = asyncio.get_running_loop()

    def _capture() -> bytes:
        from tempfile import TemporaryDirectory
        from uuid import uuid4

        with TemporaryDirectory() as tmp:
            file_name = f"report-{uuid4().hex}.png"
            hti.output_path = tmp
            hti.screenshot(
                html_str=html,
                save_as=file_name,
                size=(1600, 0),
            )
            image_path = Path(tmp) / file_name
            return image_path.read_bytes()

    return await loop.run_in_executor(None, _capture)


@app.get("/")
async def root():
    return {"status": "ok", "message": "Bangumi Annual Report API"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.post("/export-image", summary="生成年度报告图片")
async def export_image(payload: ExportRequest):
    raw_items = await fetch_collections(payload.username)
    entries = transform_games(raw_items, payload.year)

    if not entries:
        raise HTTPException(status_code=404, detail=f"{payload.year} 年没有找到任何已完成的游戏")

    months = group_by_month(entries)
    image_bytes = await render_image(payload.username, payload.year, months, len(entries))
    filename = f"bangumi-{payload.username}-{payload.year}.png"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(content=image_bytes, media_type="image/png", headers=headers)

