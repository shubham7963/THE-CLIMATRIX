set -e
cd "$(dirname "$0")/backend"
pip install -r requirements.txt --quiet
python app.py
