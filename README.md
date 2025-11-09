running backend:
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
or 
uvicorn main:app --reload --host 0.0.0.0 --port 8000

running frontend:
cd frontend 
npm start
