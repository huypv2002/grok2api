# CF Clearance Solver — Setup trên VPS Windows 10

## Mục đích
Chạy Turnstile-Solver server trên VPS Windows, kết hợp script lấy `cf_clearance` từ grok.com.

## Setup trên VPS Windows

### 1. Cài Python 3.10+
```
winget install Python.Python.3.11
```

### 2. Clone Turnstile-Solver
```
cd C:\
git clone https://github.com/Theyka/Turnstile-Solver.git
cd Turnstile-Solver
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python -m patchright install chromium
```

### 3. Chạy Turnstile-Solver API server
```
cd C:\Turnstile-Solver
venv\Scripts\activate
python api_solver.py --host 0.0.0.0 --port 5000 --browser_type chromium --thread 2
```
Server sẽ chạy tại `http://VPS_IP:5000`

### 4. Copy file cf_clearance_server.py vào VPS
Copy file `cf_clearance_server.py` từ thư mục này vào VPS.

### 5. Chạy CF Clearance Server
```
cd C:\Turnstile-Solver
venv\Scripts\activate
pip install flask patchright
python cf_clearance_server.py --host 0.0.0.0 --port 5001
```
Server sẽ chạy tại `http://VPS_IP:5001`

### 6. Mở firewall port 5001
```
netsh advfirewall firewall add rule name="CF Solver" dir=in action=allow protocol=TCP localport=5001
```

## API Endpoints

### GET /cf-clearance?url=https://grok.com
Trả về cf_clearance cookie + tất cả cookies từ grok.com

Response:
```json
{
  "cf_clearance": "xxx",
  "cookies": "sso=...; cf_clearance=...; ...",
  "user_agent": "Mozilla/5.0 ...",
  "elapsed": 12.5
}
```

### GET /health
Health check
