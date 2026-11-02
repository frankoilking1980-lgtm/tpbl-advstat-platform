FROM python:3.11-slim

WORKDIR /app

# 安裝相依套件
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 複製程式碼與剛生成的資料庫
COPY app/ ./app/
COPY data/ ./data/

# 設定通訊埠 (Cloud Run 預設會指派 8080)
ENV PORT=8080

CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}