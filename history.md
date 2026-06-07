# 2026-03-12
- Docker Compose v2 ile docker-compose.yml dosyası oluşturuldu.
- Dockerfile oluşturuldu.
- Python 8443 portundan çalışmaya başladı.
- Shared Network oluşturuldu.
- Postgresdb docker-compose.yml dosyası oluşturuldu.
- Postgresdb 8543 portundan çalışmaya başladı.
- Pgadmin 5050 portundan çalışmaya başladı. (http://76.13.60.86:5050, admin@a3gents.com, a3Admin...)
- Python container'ı postgres container'ına bağlandı. (http://76.13.60.86:8443/db-test, /docker/python8443/app/main.py)
- Telegram Bot API ile entegrasyon sağlandı. 
- Webhook register edildi.
- Webhook info alındı. (http://76.13.60.86:8443/admin/webhook-info)

# 2026-03-13
- Jupyter için docker-compose.yml dosyası güncellendi, start.sh dosyası oluşturuldu.
- Jupyter Notebook çalışmaya başladı. (hashed password gerekliliği)
- nginx ile jupyter için reverse proxy ayarlandı. (8488 portu, http://76.13.60.86:8488, a3Admin...)
- Jupyter üzerinden postgresql veritabanına bağlanıldı. (http://76.13.60.86:8488/notebooks/postgre_connection.ipynb)
- python8443 docker container için dockerfile içerisinden çağırılan start.sh dosyası önce jupyter serverı sonra da python app'i ayağa kaldıracak şekilde güncellendi.
- Jupyter dosyalarını Antigravity içerisinde çağırma, server üzerinden çalıştır!


# 2026-03-14
- Hedef sektör için ilk model oluşturuldu: restaurant.akilli_menu
    - scraper ile veri toplanacak.
    - image caption ile veri toplanacak.
    - toplanan veriler ile menü oluşturulacak veya güncelleme yapılacak.
    - sohbet temelli menü oluşturma yapılacak.
