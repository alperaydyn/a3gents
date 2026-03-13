import os
import requests
from fastapi import FastAPI, Request
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

BOT_TOKEN = os.getenv("BOT_TOKEN")
TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"


@app.get("/")
async def root():
    return {"status": "ok"}


@app.post("/webhook")
async def webhook(request: Request):
    body = await request.json()
    print("Received webhook:", body)
    return {"received": True}

@app.post("/telegram/webhook")
async def telegram_webhook(req: Request):
    update = await req.json()
    print("UPDATE:", update)

    # İşletme hesabı botu bağladığında/kaldırdığında
    if "business_connection" in update:
        bc = update["business_connection"]
        user_id = bc["user"]["id"]
        business_connection_id = bc["id"]
        is_enabled = bc.get("is_enabled", False)

        if is_enabled:
            print(f"Bağlandı: user={user_id}, connection_id={business_connection_id}")
            # TODO: bu connection_id'yi veritabanına kaydet
        else:
            print(f"Bağlantı kesildi: user={user_id}")

    # İşletme hesabına gelen müşteri mesajları
    if "business_message" in update:
        msg = update["business_message"]
        chat_id = msg["chat"]["id"]
        business_connection_id = msg["business_connection_id"]
        text = msg.get("text", "")

        print(f"İşletme mesajı: connection={business_connection_id}, chat={chat_id}, text={text}")

        requests.post(
            f"{TELEGRAM_API}/sendMessage",
            json={
                "chat_id": chat_id,
                "business_connection_id": business_connection_id,  # zorunlu
                "text": "Mesajınızı aldık, en kısa sürede dönüş yapacağız."
            }
        )

    # Normal mesajlar (değişmedi)
    if "message" in update:
        chat_id = update["message"]["chat"]["id"]
        requests.post(
            f"{TELEGRAM_API}/sendMessage",
            json={
                "chat_id": chat_id,
                "text": "Webhook received your message."
            }
        )

    return {"ok": True}


# ---------------------------------------------------------------------------
# Webhook registration helpers
# ---------------------------------------------------------------------------

def register_webhook(webhook_url: str) -> dict:
    """Register (or update) the Telegram webhook URL.

    Args:
        webhook_url: The publicly reachable HTTPS URL Telegram should POST
                     updates to, e.g. "https://yourdomain.com/telegram/webhook".

    Returns:
        The JSON response from Telegram's setWebhook API.
    """
    response = requests.post(
        f"{TELEGRAM_API}/setWebhook",
        data={"url": webhook_url},
    )
    response.raise_for_status()
    return response.json()


def get_webhook_info() -> dict:
    """Fetch the current webhook configuration from Telegram.

    Returns:
        The JSON response from Telegram's getWebhookInfo API.
    """
    response = requests.get(f"{TELEGRAM_API}/getWebhookInfo")
    response.raise_for_status()
    return response.json()


# Optional convenience endpoints so you can trigger registration via HTTP
@app.post("/admin/register-webhook")
async def api_register_webhook(request: Request):
    body = await request.json()
    webhook_url = body.get("url")
    if not webhook_url:
        return {"ok": False, "error": "'url' field is required in request body"}
    result = register_webhook(webhook_url)
    return result


@app.get("/admin/webhook-info")
async def api_webhook_info():
    return get_webhook_info()