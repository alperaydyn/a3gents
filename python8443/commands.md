# Proje Kapsamı:
Bu proje İşyeri - Müşteri - ChatBot-as-a-Service üçlüsünün etkileşiminin yönetimi amacını taşımaktadır.
VPS üzerine çalışan bir docker container üzerinde fastapi ile geliştirilmektedir.
Telegram Bot API ile entegrasyon sağlanmıştır.

Çalışma Akışı:
- İşyeri telegramdan kendi hesabını **Business Account** olarak belirler
- Telegram İşletme menüsü altındaki **Sohbet Botları** menüsünden **mahallebot_test_bot** botunu ekler
- İşyeri botun erişim modunu seçer ("Tüm Bire Bir Sohbetler Hariç" < bu , "Sadece Seçili Sohbetler")
- 

Not: İşyeri müşterisi ile yaptığı sohbette botu durdurup başlatabilir, botu yönet menüsünden botun erişim modunu değiştirebilir.

# MahalleBot Docker Compose (8443)

## docker-compose.yml (before traefik)
Here traefik is not used. The container is exposed through nginx reverse proxy.
services:
  python:
    build: .
    working_dir: /app
    volumes:
      - ./app:/app
    ports:
      - "8443:8443"
    restart: unless-stopped


## docker image compose command, from image
docker compose up -d
docker ps | grep 8443

## after updating the docker-compose.yml or dockerfile
docker compose up --build -d

## display server logs:
sudo docker logs -f python8443-python-1

## restart docker compose
docker compose restart || docker ps | grep 8443


# Bind bot with a domain address (mahallebot.a3gents.com)

## DNS Record
whois.com üzerinden alınan **a3gents.com** adresine **A Record** olarak **mahallebot.a3gents.com** adresi **76.13.60.86** adresine atandı.

http://mahallebot.a3gents.com:8443/ çalışıyor (python8443'te çalışan fastapi cevap veriyor.)

## MahalleBot SSL Sertificate Oluşturuldu:
VPS üzerinde aşağıdaki komut ile MahalleBot SSL Sertificate oluşturuldu:
```
root@srv1414004:~# sudo certbot certonly --nginx -d mahallebot.a3gents.comSaving debug log to /var/log/letsencrypt/letsencrypt.log
Enter email address (used for urgent renewal and security notices)
 (Enter 'c' to cancel): alperayd@gmail.com

- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Please read the Terms of Service at
https://letsencrypt.org/documents/LE-SA-v1.6-August-18-2025.pdf. You must agree
in order to register with the ACME server. Do you agree?
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
(Y)es/(N)o: Y

- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Would you be willing, once your first certificate is successfully issued, to
share your email address with the Electronic Frontier Foundation, a founding
partner of the Let's Encrypt project and the non-profit organization that
develops Certbot? We'd like to send you email about our work encrypting the web,
EFF news, campaigns, and ways to support digital freedom.
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
(Y)es/(N)o: Y
Account registered.
Requesting a certificate for mahallebot.a3gents.com

Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/mahallebot.a3gents.com/fullchain.pem
Key is saved at:         /etc/letsencrypt/live/mahallebot.a3gents.com/privkey.pem
This certificate expires on 2026-06-10.
These files will be updated when the certificate renews.
Certbot has set up a scheduled task to automatically renew this certificate in the background.

- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
If you like Certbot, please consider supporting our work by:
 * Donating to ISRG / Let's Encrypt:   https://letsencrypt.org/donate
 * Donating to EFF:                    https://eff.org/donate-le
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
root@srv1414004:~# 
```

# Telegram WebHook Register

## Register WebHook
curl https://api.telegram.org/bot<BOT_TOKEN>/setWebhook -d url=https://mahallebot.a3gents.com/telegram/webhook \
  -d allowed_updates='["message","business_connection","business_message"]'

## Verify WebHook
curl https://mahallebot.a3gents.com/admin/webhook-info


# Postgresdb

## docker-compose.yml 
```yaml
services:
  postgres:
    image: postgres:16
    container_name: postgres
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "${POSTGRES_PORT}:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  pgadmin:
    image: dpage/pgadmin4
    container_name: pgadmin
    environment:
      PGADMIN_DEFAULT_EMAIL: ${PGADMIN_DEFAULT_EMAIL}
      PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_DEFAULT_PASSWORD}
    ports:
      - "${PGADMIN_PORT}:80"
    volumes:
      - pgadmindata:/var/lib/pgadmin

volumes:
  pgdata:
  pgadmindata:
```

# Docker Shared Network
each docker container must be connected to shared-network.
network name is shared-network.

## Create Shared Network
docker network create shared-network

## Add Containers to Shared Network
docker network connect shared-network python8443-python-1
docker network connect shared-network postgres

## Docke Restart
```bash
docker compose down && docker compose up -d
```

# Jupyter Notebook

## Setup steps
### docker-compose.yml dosyası güncellendi, 
ports ve environment değişkenleri eklendi.
dockerfile dosyasına start.sh komutu eklendi.

### start.sh dosyası oluşturuldu.
Start.sh dosyası jupyter notebook şifresini oluşturuyor.

### nginx ile jupyter için reverse proxy ayarlandı. (8488 portu)
```nginx
server {
    listen 8488;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:8488;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # Required for Jupyter WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

### Jupyter Notebook çalışmaya başladı. (hashed password gerekliliği)
Jupyter --allow-root ve hashed password gerektiriyor.

### Jupyter üzerinden postgresql veritabanına bağlanıldı.
python8443 ve postgredb docker-compose.yml dosyaları güncellendi. (shared-network eklendi.)
python8443 docker-compose.yml içerisinde network python bloğu içerisinde yer alması gerekmektedir.

```yml
services:
  python:
    build: .
    working_dir: /app
    volumes:
      - ./app:/app
    ports:
      - "8443:8443"
      - "${JUPYTER_PORT}:8888"
    restart: unless-stopped
    environment:
      - BOT_TOKEN=${BOT_TOKEN}
      - CUSTOMER_TOKEN_THEHUNGER=${CUSTOMER_TOKEN_THEHUNGER}
      - JUPYTER_PASSWORD=${JUPYTER_PASSWORD}
      - JUPYTER_PORT=${JUPYTER_PORT}
    networks:  # bu blok postgres container ile bağlantı için gereklidir.
      - default
      - shared-network

networks:
  shared-network:
    external: true
```

### Jupyter Notebook üzerinden postgresql veritabanına bağlanıldı.

```python
import psycopg2

conn = psycopg2.connect(
    host='postgres', 
    port=5432, 
    dbname='mahalle_db', 
    user='admin@a3gents.com', 
    password='a3Admin!23'
)

cursor = conn.cursor()
cursor.execute("SELECT * FROM information_schema.tables")
rows = cursor.fetchall()

for row in rows:
    print(row)

cursor.close()
conn.close()
```



