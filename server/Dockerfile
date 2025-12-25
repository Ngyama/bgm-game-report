FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    fonts-wqy-zenhei \
    chromium \
    chromium-driver \
    libnss3 \
    libxss1 \
    libasound2 \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxi6 \
    libxtst6 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libxrandr2 \
    && rm -rf /var/lib/apt/lists/*

# 设置 Chromium 路径环境变量
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium

# 创建符号链接，确保 html2image 能找到 chromium
RUN ln -sf /usr/bin/chromium /usr/bin/chromium-browser || true
RUN ln -sf /usr/bin/chromium /usr/bin/google-chrome || true

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY templates ./templates

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

