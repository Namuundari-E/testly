running backend:  
cd backend  
python -m venv venv  
venv\Scripts\activate  
pip install -r requirements.txt  
uvicorn main:app --reload  
or   
uvicorn main:app --reload --host 0.0.0.0 --port 8000  
  
running backend through docker :  
docker build -t test-checker-backend .  
docker run -p 8000:8000 test-checker-backend(docker start -a test-checker-backend)  
  
running frontend:  
cd frontend   
npm start  
