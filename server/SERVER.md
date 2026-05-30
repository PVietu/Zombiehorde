# 🧟 Zombie Horde — Инструкция по настройке сервера

## Обзор

Сервер написан на **Node.js** с использованием **Express** и **Socket.IO**.
При запуске автоматически создаётся публичный туннель через **ngrok**.

---

## 📋 Требования

- **Node.js** версии 18.0.0 или выше
- **npm** версии 8+
- Интернет-соединение (для ngrok-туннеля)
- (Опционально) Google Cloud VM / любой VPS

---

## 🚀 Быстрый старт

### 1. Установка Node.js (если не установлен)

```bash
# Ubuntu / Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Проверка версии
node --version  # должно быть >= 18.0.0
npm --version
```

### 2. Копирование файлов сервера

```bash
# Создайте папку проекта
mkdir zombie-horde-server
cd zombie-horde-server

# Скопируйте содержимое папки server/ в эту директорию:
# - server.js
# - package.json
# - public/ (папка со статическими файлами)
```

### 3. Установка зависимостей

```bash
npm install
```

Будут установлены:
- `express` — HTTP-сервер и раздача статики
- `socket.io` — WebSocket для мультиплеера
- `ngrok` — публичный туннель

### 4. Запуск сервера

```bash
node server.js
```

После запуска в консоли появится:

```
🧟 ZOMBIE HORDE SERVER
📡 Running on http://localhost:3000
📁 Serving static files from: /path/to/public

✅ NGROK TUNNEL ACTIVE
🌐 Public URL: https://darkness-flaccid-sheet.ngrok-free.dev
🔌 WebSocket URL: wss://darkness-flaccid-sheet.ngrok-free.dev/ws/

📋 Share this WebSocket URL with players:
   wss://darkness-flaccid-sheet.ngrok-free.dev/ws/

🎮 Players can connect at: https://darkness-flaccid-sheet.ngrok-free.dev
💾 URL saved to ngrok-url.txt

[GAME] Waiting for players to join...
```

### 5. Подключение игроков

1. Откройте игру в браузере
2. Нажмите **«Подключиться к серверу»**
3. Введите WebSocket URL из консоли: `wss://xxxxxxxx.ngrok-free.dev/ws/`
4. Нажмите **«Подключиться»**

---

## ☁️ Развёртывание на Google Cloud VM

### Шаг 1: Создание VM

1. Перейдите в [Google Cloud Console](https://console.cloud.google.com/)
2. Compute Engine → VM Instances → Create Instance
3. Параметры:
   - Machine type: `e2-medium` (2 vCPU, 4 GB RAM)
   - OS: Ubuntu 22.04 LTS
   - Firewall: ✅ Allow HTTP, ✅ Allow HTTPS
   - (Опционально) Разрешить порт 3000 в Firewall Rules

### Шаг 2: Подключение к VM

```bash
# Через Cloud Shell или SSH
gcloud compute ssh your-vm-name --zone=your-zone
```

### Шаг 3: Установка Node.js на VM

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Проверка
node --version
npm --version
```

### Шаг 4: Загрузка файлов сервера

**Вариант A: Через git**
```bash
git clone https://github.com/PVietu/Zombiehorde.git
cd Zombiehorde/server
npm install
```

**Вариант B: Через scp (загрузить локальные файлы)**
```bash
# С локальной машины:
gcloud compute scp --recurse ./server/ your-vm-name:~/zombie-horde-server/ --zone=your-zone
```

### Шаг 5: Запуск сервера (фоновый режим)

```bash
# Установка PM2 (менеджер процессов)
sudo npm install -g pm2

# Запуск сервера
cd ~/zombie-horde-server
pm2 start server.js --name "zombie-horde"

# Автозапуск при перезагрузке
pm2 startup
pm2 save
```

**Или через screen (проще):**
```bash
screen -S zombie
node server.js
# Ctrl+A, D — отключиться (сервер продолжит работу)
# screen -r zombie — вернуться к сессии
```

### Шаг 6: Открытие порта 3000 (если ngrok не используется)

```bash
# В Google Cloud Console: VPC Network → Firewall Rules
# Создать правило:
# - Name: allow-zombie-horde
# - Direction: Ingress
# - Targets: All instances
# - Source IP: 0.0.0.0/0
# - Protocols: TCP port 3000
```

---

## 📦 Запуск в Google Colab (тестовый режим)

> ⚠️ Colab не рекомендуется для продакшена, но подходит для тестирования.

1. Создайте новый ноутбук в [Google Colab](https://colab.research.google.com/)
2. Выполните следующие ячейки:

```python
# Ячейка 1: Установка зависимостей
!curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
!apt-get install -y nodejs
!node --version
```

```python
# Ячейка 2: Загрузка файлов сервера
import os
os.makedirs('/content/zombie-server', exist_ok=True)

# Загрузите server.js и package.json в /content/zombie-server/
# (через Files panel слева или git clone)
```

```python
# Ячейка 3: Установка зависимостей Node
!cd /content/zombie-server && npm install
```

```python
# Ячейка 4: Запуск сервера (в фоне)
import subprocess
import time

proc = subprocess.Popen(
    ['node', 'server.js'],
    cwd='/content/zombie-server',
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True
)

time.sleep(5)  # Ждём инициализации

# Читаем вывод
for i in range(20):
    line = proc.stdout.readline()
    if line:
        print(line.strip())
    if 'ngrok-free.dev' in line or 'TUNNEL ACTIVE' in line:
        break
```

```python
# Ячейка 5: Получение ngrok URL
with open('/content/zombie-server/ngrok-url.txt', 'r') as f:
    print(f.read())
```

---

## ⚙️ Конфигурация сервера

### Переменные в server.js (строки 10-15)

| Переменная | Значение по умолчанию | Описание |
|------------|----------------------|----------|
| `PORT` | `3000` | Порт сервера |
| `NGROK_TOKEN` | `3ER3n9...` | Токен авторизации ngrok |
| `TICK_RATE` | `20` | Частота обновления (Гц) |

### Изменение порта

```bash
PORT=8080 node server.js
# или
export PORT=8080 && node server.js
```

---

## 📊 Мониторинг

### Статус сервера (REST API)

```
GET http://localhost:3000/health
```

Ответ:
```json
{
  "status": "ok",
  "players": 3,
  "wave": 5,
  "phase": "combat",
  "zombies": 12
}
```

### Логи PM2

```bash
pm2 logs zombie-horde
pm2 monit
```

---

## 🔧 Устранение проблем

### ngrok не запускается
- Проверьте интернет-соединение
- Токен ngrok мог устареть — создайте новый на [ngrok.com](https://ngrok.com)
- Убедитесь, что `npm install` завершился без ошибок

### Игроки не могут подключиться
1. Убедитесь, что URL имеет формат: `wss://xxxx.ngrok-free.dev/ws/`
2. Проверьте, что сервер запущен и показывает "TUNNEL ACTIVE"
3. Откройте `http://localhost:3000/health` — должен ответить JSON

### Ошибка EADDRINUSE (порт занят)
```bash
# Найти и завершить процесс на порту 3000
lsof -ti:3000 | xargs kill -9
# или
fuser -k 3000/tcp
```

### Высокая задержка
- Уменьшите `TICK_RATE` до 10 в `server.js`
- Выберите регион VM ближе к игрокам

---

## 🔐 Безопасность

- ngrok-токен в коде — это тестовый токен. В продакшене используйте переменные окружения:
  ```bash
  export NGROK_TOKEN=your_token_here
  node server.js
  ```
- Сервер не хранит личные данные игроков
- Базовая защита от читов: валидация позиций, серверный raycast

---

## 📞 Сетевая архитектура

```
[Браузер игрока]
      |
      | WSS (Socket.IO)
      |
[ngrok туннель] ←→ [Node.js сервер :3000]
                           |
                    [Express HTTP]
                    [Socket.IO /ws/]
                    [Game Loop 20Hz]
```

---

*Zombie Horde Server v1.0.0 | Socket.IO 4.7.2 | Express 4.18.2*
