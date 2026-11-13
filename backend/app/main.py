from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import router
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(
    title="TPBL AdvStats API",
    description="臺灣職業籃球大聯盟 (TPBL) 進階攻防數據純唯讀 API",
    version="2.0.0"
)

# 設定 CORS 允許前端 (Vercel 或 Localhost) 存取
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/", summary="健康檢查")
def health_check():
    return {"status": "ok", "service": "TPBL AdvStats Clean API", "version": "2.0.0"}