from contextlib import asynccontextmanager
import threading
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import router, warmup_player_caches
from dotenv import load_dotenv
load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 背景預熱球員與進階數據快取，確保 Cloud Run (min-instances=1) 啟動即完成計算
    threading.Thread(target=warmup_player_caches, daemon=True).start()
    yield


app = FastAPI(
    title="TPBL AdvStats API",
    description="臺灣職業籃球大聯盟 (TPBL) 進階攻防數據純唯讀 API",
    version="2.0.0",
    lifespan=lifespan,
)

# 設定 CORS 允許前端 (Vercel 或 Localhost) 存取
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["ETag"],
)

app.include_router(router)


@app.get("/", summary="健康檢查")
def health_check():
    return {"status": "ok", "service": "TPBL AdvStats Clean API", "version": "2.0.0"}