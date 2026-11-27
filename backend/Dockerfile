FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt requirements-vector.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
 && pip install --no-cache-dir -r requirements-vector.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "asgi:app", "--host", "0.0.0.0", "--port", "8000"]
