#!/bin/bash
# Start Jupyter Notebook in the background
HASHED_PASSWORD=$(python3 -c "from jupyter_server.auth import passwd; print(passwd('$JUPYTER_PASSWORD'))")
jupyter notebook --no-browser --port=8888 --ip=0.0.0.0 --allow-root \
  --IdentityProvider.token='' \
  --PasswordIdentityProvider.hashed_password="$HASHED_PASSWORD" &

# Start the main uvicorn app in the foreground
uvicorn main:app --host 0.0.0.0 --port 8443 --reload
