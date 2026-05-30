# 🖧 ZOMBIE HORDE — Инструкция по серверу

## Развёртывание на Google Cloud VM

### Шаг 1: Создание VM в Google Cloud

1. Откройте [Google Cloud Console](https://console.cloud.google.com)
2. Перейдите в **Compute Engine → VM instances**
3. Нажите **Create instance**
4. Настройки:
   - **Machine type**: e2-medium (2 vCPU, 4 GB RAM)
   - **Boot disk**: Ubuntu 22.04 LTS, 20 GB
   - **Firewall**: Разрешить HTTP и HTTPS трафик
5. Нажмите **Create**

### Шаг 2: Открытие портов

В Google Cloud Console:
1. Перейдите в **VPC Network → Firewall**
2. Нажмите **Create Firewall Rule**
3. Настройки:
   - Name: `zombie-horde-server`
   - Targets: All instances in the network
   - Source IP ranges: 0.0.0.0/0
   - Protocols and ports: TCP 3000
4. Нажмите **Create**

### Шаг 3: Подключение к VM

```bash
# В Google Cloud Console нажмите "SSH" рядом с VM
# или используйте gcloud CLI:
gcloud compute ssh INSTANCE_NAME --zone=ZONE
```

### Шаг 4: Установка Node.js 18+

```bash
# Обновить систему
sudo apt update && sudo apt upgrade -y

# Установить curl
sudo apt install -y curl

# Установить Node.js 18 через NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Проверить версию
node --version  # должно быть v18.x.x или выше
npm --version
```

### Шаг 5: Установка Git и клонирование

```bash
sudo apt install -y git

# Если используете репозиторий:
git clone https://github.com/YOUR_USERNAME/zombie-horde.git
cd zombie-horde

# Или загрузите файлы через scp:
# scp -r ./server/ user@VM_IP:~/zombie-horde/
```

### Шаг 6: Установка зависимостей сервера

```bash
cd server/
npm install

# Или с явным указанием версий:
npm install express@4.18.2 socket.io@4.7.2 ngrok@5.0.0-beta.2
```

### Шаг 7: Сборка клиентской части (опционально)

```bash
# Вернуться в корень проекта
cd ..

# Установить зависимости клиента
npm install

# Собрать клиент
npm run build

# Файлы будут в папке dist/
```

### Шаг 8: Запуск сервера

```bash
cd server/
node server.js
```

**Ожидаемый вывод:**
```
🧟 ZOMBIE HORDE SERVER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Server running on http://localhost:3000
✅ Socket.IO path: /ws/

🌐 ПУБЛИЧНЫЙ ДОСТУП ЧЕРЕЗ NGROK:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 HTTP URL: https://xxxx.ngrok-free.dev
🔌 WebSocket URL: wss://xxxx.ngrok-free.dev

📋 Скопируйте этот URL для игроков:
   wss://xxxx.ngrok-free.dev
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Шаг 9: Запуск в фоне (systemd)

```bash
# Создать systemd service
sudo nano /etc/systemd/system/zombie-horde.service
```

Вставить содержимое:
```ini
[Unit]
Description=Zombie Horde Game Server
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME/zombie-horde/server
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

```bash
# Применить и запустить
sudo systemctl daemon-reload
sudo systemctl enable zombie-horde
sudo systemctl start zombie-horde

# Проверить статус
sudo systemctl status zombie-horde

# Просмотр логов
sudo journalctl -u zombie-horde -f
```

---

## Развёртывание через Google Colab

### Шаг 1: Создать новый ноутбук в Google Colab

Откройте [Google Colab](https://colab.research.google.com) и создайте новый ноутбук.

### Шаг 2: Установить Node.js

```python
# Ячейка 1
!curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
!apt-get install -y nodejs
!node --version
!npm --version
```

### Шаг 3: Загрузить файлы сервера

```python
# Ячейка 2 — Создать структуру папок
import os
os.makedirs('/content/zombie-horde/server', exist_ok=True)
```

**Вариант A**: Клонировать из GitHub:
```python
# Ячейка 3
!git clone https://github.com/YOUR_USERNAME/zombie-horde.git /content/zombie-horde
```

**Вариант B**: Загрузить вручную через интерфейс Colab (Files → Upload).

### Шаг 4: Установить зависимости

```python
# Ячейка 4
%cd /content/zombie-horde/server
!npm install
```

### Шаг 5: Запустить сервер

```python
# Ячейка 5
import subprocess
import threading
import time

def run_server():
    process = subprocess.Popen(
        ['node', 'server.js'],
        cwd='/content/zombie-horde/server',
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        universal_newlines=True
    )
    for line in process.stdout:
        print(line, end='')

thread = threading.Thread(target=run_server)
thread.daemon = True
thread.start()

# Подождать запуска
time.sleep(5)
print("Server started!")
```

### Шаг 6: Получить ngrok URL

```python
# Ячейка 6
# URL будет выведен в консоли при запуске server.js
# Ищите строку: 🔌 WebSocket URL: wss://xxxx.ngrok-free.dev
```

> ⚠️ **Важно**: Colab сессия завершается через ~12 часов или при отключении от интернета. Для продакшена используйте VPS.

---

## Конфигурация сервера

### Переменные окружения

Можно задать через `.env` файл (создайте в папке `server/`):

```env
PORT=3000
NGROK_TOKEN=3ER3n9UuUjAf4z0flHlfDXaP6ST_7SGNJYjwX7zRSUWB5NTEK
TICK_RATE=20
```

### Параметры сервера

В `server.js`:

```javascript
const PORT = 3000;         // Порт сервера
const TICK_RATE = 20;      // Обновлений в секунду (рекомендуется 20-30)
```

---

## Troubleshooting

### Сервер не запускается

```bash
# Проверить, занят ли порт
sudo lsof -i :3000
# Завершить процесс
sudo kill -9 $(sudo lsof -t -i:3000)
```

### ngrok не подключается

1. Проверьте токен: `3ER3n9UuUjAf4z0flHlfDXaP6ST_7SGNJYjwX7zRSUWB5NTEK`
2. Проверьте интернет-соединение
3. Попробуйте переустановить ngrok: `npm install ngrok@latest`

### Игроки не могут подключиться

1. Убедитесь, что firewall открыт на порт 3000
2. Используйте формат URL: `wss://xxxx.ngrok-free.dev` (без `/` в конце)
3. Проверьте CORS — сервер настроен на `origin: '*'`

### Низкая производительность

```javascript
// В server.js уменьшите TICK_RATE:
const TICK_RATE = 15; // вместо 20
```

---

## Мониторинг

```bash
# Проверить здоровье сервера
curl http://localhost:3000/health

# Ответ:
# {"status":"ok","players":3,"wave":4,"phase":"combat"}
```

---

## Безопасность

> ⚠️ Данный сервер предназначен для игры в небольшой группе. Для публичного продакшена:
> 1. Добавьте rate limiting
> 2. Настройте CORS для конкретных доменов
> 3. Используйте HTTPS/WSS с SSL-сертификатом
> 4. Добавьте аутентификацию игроков
