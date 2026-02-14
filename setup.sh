#!/bin/bash
# Setup script for KnowledgeHub
# Run this to create the .streamlit directory and secrets template

echo -e "\033[0;32mCreating .streamlit directory...\033[0m"
mkdir -p .streamlit

echo -e "\033[0;32mCreating secrets.toml.example...\033[0m"
cat > .streamlit/secrets.toml.example << 'EOF'
# Supabase Configuration
[supabase]
url = "https://your-project.supabase.co"
key = "your-anon-key"

# Google Gemini API
[gemini]
api_key = "your-gemini-api-key"
EOF

echo -e "\033[0;32mCreating .streamlit/.gitignore...\033[0m"
cat > .streamlit/.gitignore << 'EOF'
secrets.toml
EOF

echo -e "\n\033[0;32mSetup complete!\033[0m"
echo -e "\n\033[0;33mNext steps:\033[0m"
echo "1. Copy .streamlit/secrets.toml.example to .streamlit/secrets.toml"
echo "2. Fill in your Supabase and Gemini API credentials"
echo "3. Run the Supabase SQL setup (supabase_setup.sql)"
echo "4. Install dependencies: pip install -r requirements.txt"
echo "5. Run the app: streamlit run app.py"
