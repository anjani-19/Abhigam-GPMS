from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from .config import get_settings
from .database import Base, engine
from .routes.api import router

app = FastAPI(title='Abhigam - GPMS API', version='1.0.0', description='Secure gate-pass workflow for JNN INSTITUTE')
app.add_middleware(CORSMiddleware, allow_origins=get_settings().origins, allow_credentials=True, allow_methods=['*'], allow_headers=['*'])
app.include_router(router, prefix='/api', tags=['Gate Pass'])

@app.on_event('startup')
def startup():
    Base.metadata.create_all(engine)
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            # Check if is_emergency column exists on gate_passes
            if engine.dialect.name == "sqlite":
                res = conn.execute(text("PRAGMA table_info(gate_passes)")).fetchall()
                col_names = [r[1] for r in res]
                if "is_emergency" not in col_names:
                    conn.execute(text("ALTER TABLE gate_passes ADD COLUMN is_emergency BOOLEAN DEFAULT 0"))
                if "emergency_reason" not in col_names:
                    conn.execute(text("ALTER TABLE gate_passes ADD COLUMN emergency_reason TEXT DEFAULT NULL"))
    except Exception as e:
        pass

# Serve built frontend if dist/ exists (unified production deployment)
frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if frontend_dist.exists() and (frontend_dist / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=str(frontend_dist / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend_spa(full_path: str):
        file_path = frontend_dist / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")
