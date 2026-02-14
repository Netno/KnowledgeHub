# Setup script for KnowledgeHub
# Run this to create the .streamlit directory and secrets template

Write-Host "Creating .streamlit directory..." -ForegroundColor Green
New-Item -ItemType Directory -Path ".streamlit" -Force | Out-Null

Write-Host "Creating secrets.toml.example..." -ForegroundColor Green
@"
# Supabase Configuration
[supabase]
url = "https://your-project.supabase.co"
key = "your-anon-key"

# Google Gemini API
[gemini]
api_key = "your-gemini-api-key"
"@ | Out-File -FilePath ".streamlit\secrets.toml.example" -Encoding UTF8

Write-Host "Creating .streamlit\.gitignore..." -ForegroundColor Green
@"
secrets.toml
"@ | Out-File -FilePath ".streamlit\.gitignore" -Encoding UTF8

Write-Host "`nSetup complete!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Copy .streamlit\secrets.toml.example to .streamlit\secrets.toml"
Write-Host "2. Fill in your Supabase and Gemini API credentials"
Write-Host "3. Run the Supabase SQL setup (supabase_setup.sql)"
Write-Host "4. Install dependencies: pip install -r requirements.txt"
Write-Host "5. Run the app: streamlit run app.py"
