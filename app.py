import streamlit as st
import streamlit.components.v1
from streamlit_option_menu import option_menu
from supabase import create_client, Client
import google.generativeai as genai
from datetime import datetime
import pandas as pd
from PIL import Image
import io
import json
import time
import re

# Configure page
st.set_page_config(page_title="KnowledgeHub", page_icon="💡", layout="wide")

# Initialize Supabase client
@st.cache_resource
def init_supabase():
    url = st.secrets["supabase"]["url"]
    key = st.secrets["supabase"]["key"]
    return create_client(url, key)

supabase = init_supabase()

# Initialize Gemini
genai.configure(api_key=st.secrets["gemini"]["api_key"])
MODEL_NAME = "gemma-3-27b-it"
model = genai.GenerativeModel(MODEL_NAME)

# Allowed users (configure in secrets.toml under [access])
ALLOWED_EMAILS = st.secrets.get("access", {}).get("allowed_emails", [])
ALLOWED_DOMAINS = st.secrets.get("access", {}).get("allowed_domains", [])
ADMIN_EMAILS = st.secrets.get("access", {}).get("admin_emails", [])

def is_allowed_user(email):
    """Check if email or domain is in allowlist."""
    if not email:
        return False
    email_lower = email.lower()
    # Check specific emails
    if email_lower in [e.lower() for e in ALLOWED_EMAILS]:
        return True
    # Check domain
    domain = email_lower.split("@")[-1]
    if domain in [d.lower() for d in ALLOWED_DOMAINS]:
        return True
    return False

def is_admin(email):
    """Check if user is admin."""
    if not email:
        return False
    return email.lower() in [e.lower() for e in ADMIN_EMAILS]

# Authentication
def check_authentication():
    if 'user' not in st.session_state:
        st.session_state.user = None
    
    if st.session_state.user is None:
        # Shared card styles - works in both light and dark theme
        _card_style = """
            <style>
                /* Hide Streamlit chrome */
                [data-testid="stHeader"],
                [data-testid="stBottom"],
                [data-testid="stDecoration"],
                [data-testid="stToolbar"],
                [data-testid="stStatusWidget"],
                [data-testid="stAppDeployButton"],
                [data-testid="stSidebarCollapsedControl"],
                [data-testid="collapsedControl"],
                section[data-testid="stSidebar"],
                header, #MainMenu, footer { display: none !important; height: 0 !important; min-height: 0 !important; }
                /* Force zero top spacing everywhere */
                html, body { margin: 0 !important; padding: 0 !important; }
                [data-testid="stApp"],
                [data-testid="stApp"] > div,
                [data-testid="stAppViewContainer"],
                [data-testid="stAppViewContainer"] > div,
                [data-testid="stMain"],
                [data-testid="stMainBlockContainer"] {
                    padding-top: 0 !important;
                    margin-top: 0 !important;
                }
                .block-container {
                    padding-top: 100px !important;
                    margin-top: 0 !important;
                    max-width: 380px !important;
                    padding-left: 1rem !important;
                    padding-right: 1rem !important;
                }
                .auth-card {
                    background: var(--secondary-background-color, #f0f2f6);
                    border-radius: 16px;
                    padding: 2rem 1.5rem 1.5rem;
                    text-align: center;
                    margin-bottom: 0.75rem;
                    color: var(--text-color, #1a1a2e);
                }
                .auth-card h2 { margin: 0 0 0.5rem 0; font-size: 1.5rem; color: var(--text-color, #1a1a2e); }
                .auth-card p { opacity: 0.6; margin: 0; font-size: 0.9rem; color: var(--text-color, #1a1a2e); }
            </style>
        """
        
        # Check for OAuth code in URL (Supabase PKCE flow)
        query_params = st.query_params
        
        if "code" in query_params:
            auth_code = query_params["code"]
            try:
                response = supabase.auth.exchange_code_for_session({"auth_code": auth_code})
                user_email = response.user.email
                if not is_allowed_user(user_email):
                    supabase.auth.sign_out()
                    st.query_params.clear()
                    st.markdown(_card_style, unsafe_allow_html=True)
                    st.markdown("""
                        <div class="auth-card">
                            <div class="auth-icon">⛔</div>
                            <h2>Access Denied</h2>
                            <p>You do not have permission to sign in.</p>
                        </div>
                    """, unsafe_allow_html=True)
                    st.link_button("Sign in", st.secrets.get("app_url", "http://localhost:8501"), use_container_width=True)
                    st.stop()
                st.session_state.user = response
                st.query_params.clear()
                st.rerun()
            except Exception as e:
                st.query_params.clear()
                st.error(f"Auth error: {e}")
                st.stop()
        
        if "access_token" in query_params:
            access_token = query_params["access_token"]
            try:
                user = supabase.auth.get_user(access_token)
                user_email = user.user.email
                if not is_allowed_user(user_email):
                    supabase.auth.sign_out()
                    st.query_params.clear()
                    st.markdown(_card_style, unsafe_allow_html=True)
                    st.markdown("""
                        <div class="auth-card">
                            <div class="auth-icon">⛔</div>
                            <h2>Access Denied</h2>
                            <p>You do not have permission to sign in.</p>
                        </div>
                    """, unsafe_allow_html=True)
                    st.link_button("Sign in", st.secrets.get("app_url", "http://localhost:8501"), use_container_width=True)
                    st.stop()
                st.session_state.user = user
                st.query_params.clear()
                st.rerun()
            except Exception as e:
                st.query_params.clear()
                st.rerun()
        
        # Login page
        st.markdown(_card_style, unsafe_allow_html=True)
        st.markdown("""
            <div class="auth-card">
                <h2>KnowledgeHub</h2>
                <p>Sign in to continue</p>
            </div>
        """, unsafe_allow_html=True)
        
        try:
            response = supabase.auth.sign_in_with_oauth({
                "provider": "google"
            })
            google_url = response.url
            st.link_button("🔐 Sign in with Google", google_url, use_container_width=True)
        except Exception as e:
            st.caption(f"Google login ej tillgängligt: {e}")
        
        st.stop()

check_authentication()

# AI Functions
def analyze_content(content, file_info=None):
    """Use Gemini to analyze and extract metadata from content"""
    prompt = f"""Analyze the following content and extract structured information.
Return a JSON object with these fields (include only what you can identify):
- summary: Brief 1-2 sentence summary
- topics: Array of main topics/themes
- entities: Array of named entities (people, companies, products, etc.)
- category: Best fitting category (e.g., "Feedback", "Idea", "Bug Report", "Meeting Notes", "Research", "Question", "Documentation", etc.)
- sentiment: "positive", "negative", "neutral", or "mixed"
- action_items: Array of any action items or tasks mentioned
- key_points: Array of main takeaways

Content:
{content}

{f"File info: {file_info}" if file_info else ""}

Respond with ONLY valid JSON, no markdown formatting."""
    
    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        # Remove markdown code blocks if present
        if text.startswith("```"):
            lines = text.split("\n")
            # Remove first line (```json) and last line (```)
            text = "\n".join(lines[1:-1])
        elif text.startswith("`"):
            text = text.strip("`")
        
        result = json.loads(text)
        return result
    except json.JSONDecodeError as e:
        # Try to extract JSON from response
        import re
        json_match = re.search(r'\{[\s\S]*\}', response.text)
        if json_match:
            try:
                return json.loads(json_match.group())
            except:
                pass
        return {"error": f"JSON parse error: {str(e)}", "raw_response": response.text[:500], "summary": content[:200]}
    except Exception as e:
        return {"error": f"Model: {MODEL_NAME} - {str(e)}", "summary": content[:200]}

def analyze_image(image):
    """Analyze image using Gemini Vision"""
    try:
        response = model.generate_content([
            "Describe this image in detail. Extract any text visible. Identify what type of content this is.",
            image
        ])
        return response.text
    except Exception as e:
        return f"Error analyzing image: {e}"

def analyze_csv(df):
    """Analyze CSV/Excel content"""
    summary = f"Spreadsheet with {len(df)} rows and {len(df.columns)} columns.\n"
    summary += f"Columns: {', '.join(df.columns.astype(str).tolist())}\n"
    summary += f"Sample data:\n{df.head(3).to_string()}"
    return summary

def read_excel(uploaded_file):
    """Read Excel file - all sheets"""
    try:
        import openpyxl
        # Read all sheets
        dfs = pd.read_excel(uploaded_file, sheet_name=None, engine='openpyxl')
        return dfs  # Returns dict of {sheet_name: dataframe}
    except ImportError:
        return None
    except Exception as e:
        return None

def read_pdf(uploaded_file):
    """Extract text from PDF"""
    try:
        import pypdf
        pdf_reader = pypdf.PdfReader(uploaded_file)
        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text() + "\n"
        return text
    except ImportError:
        return "[PDF support requires pypdf: pip install pypdf]"
    except Exception as e:
        return f"Error reading PDF: {e}"

def generate_embedding(text):
    """Generate embedding for semantic search"""
    try:
        result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=text[:5000],
            task_type="retrieval_document"
        )
        return result['embedding']
    except Exception as e:
        print(f"Embedding error: {e}")
        return None

def save_entry(content, ai_analysis, file_type=None, file_name=None):
    """Save entry to Supabase"""
    embedding = generate_embedding(content)
    
    data = {
        "user_id": st.session_state.user.user.id,
        "content": content,
        "ai_analysis": ai_analysis,
        "file_type": file_type,
        "file_name": file_name,
        "embedding": embedding,
        "created_at": datetime.utcnow().isoformat()
    }
    
    try:
        result = supabase.table("entries").insert(data).execute()
        return True, "Saved!"
    except Exception as e:
        return False, f"Error: {e}"

def search_entries(query, limit=10):
    """Search entries using semantic similarity"""
    query_embedding = generate_embedding(query)
    
    if query_embedding is None:
        return []
    
    try:
        result = supabase.rpc(
            "match_entries",
            {
                "query_embedding": query_embedding,
                "match_threshold": 0.65,
                "match_count": limit
            }
        ).execute()
        return result.data
    except Exception as e:
        st.error(f"Search error: {e}")
        return []

# Main App
st.markdown("""
    <style>
        .block-container { padding-top: 1rem !important; }
        [data-testid="stHeader"] { height: 2rem !important; min-height: 2rem !important; }
        /* Hide sidebar completely - we use inline navigation */
        section[data-testid="stSidebar"],
        [data-testid="stSidebarCollapsedControl"],
        [data-testid="collapsedControl"] {
            display: none !important;
        }
    </style>
""", unsafe_allow_html=True)
streamlit.components.v1.html("""
    <div style="display:flex; align-items:center; gap:0; font-family: 'Source Sans Pro', sans-serif; margin-left:-20px;">
        <svg width="45" height="45" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="40" r="24" fill="#FBBF24" opacity="0.25"/>
            <path d="M50 18C38.95 18 30 26.95 30 38c0 7.5 4.1 14 10.2 17.5 1.3.75 2.3 2 2.6 3.5l.7 3h12.9l.7-3c.3-1.5 1.3-2.75 2.6-3.5C65.9 52 70 45.5 70 38c0-11.05-8.95-20-20-20z" fill="#FBBF24"/>
            <rect x="40" y="65" width="20" height="4" rx="2" fill="#9CA3AF"/>
            <rect x="42" y="71" width="16" height="4" rx="2" fill="#9CA3AF"/>
            <rect x="44" y="77" width="12" height="4" rx="2" fill="#9CA3AF"/>
            <line x1="50" y1="8" x2="50" y2="14" stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="76" y1="38" x2="82" y2="38" stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="18" y1="38" x2="24" y2="38" stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="68" y1="20" x2="72" y2="16" stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="28" y1="16" x2="32" y2="20" stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
        <span id="kh-title" style="font-size:2rem; font-weight:700;">KnowledgeHub</span>
    </div>
    <script>
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.getElementById('kh-title').style.color = isDark ? '#FAFAFA' : '#1a1a2e';
    </script>
""", height=50)

# Navigation + user info
user_email = st.session_state.user.user.email if st.session_state.user else None
user_is_admin = is_admin(user_email)

# Detect mobile via CSS: show option_menu on desktop, selectbox on mobile
st.markdown("""
    <style>
        /* Desktop: show option_menu, hide selectbox nav */
        @media (min-width: 769px) {
            .mobile-nav { display: none !important; }
        }
        /* Mobile: hide option_menu, show selectbox nav */
        @media (max-width: 768px) {
            .desktop-nav iframe { display: none !important; }
            .desktop-nav { min-height: 0 !important; height: 0 !important; overflow: hidden !important; margin: 0 !important; padding: 0 !important; }
        }
    </style>
""", unsafe_allow_html=True)

if user_is_admin:
    # Desktop: horizontal option_menu
    with st.container():
        st.markdown('<div class="desktop-nav">', unsafe_allow_html=True)
        desktop_page = option_menu(
            menu_title=None,
            options=["Add", "Search", "Browse", "Admin"],
            icons=["plus-circle", "search", "folder", "gear"],
            orientation="horizontal",
            key="desktop_nav",
            styles={
                "container": {"padding": "0!important", "margin-bottom": "0.5rem"},
                "nav-link": {"font-size": "0.85rem", "padding": "0.4rem 0.6rem"},
                "nav-link-selected": {"background-color": "#FBBF24", "color": "#1a1a2e"},
            }
        )
        st.markdown('</div>', unsafe_allow_html=True)

    # Mobile: selectbox dropdown
    with st.container():
        st.markdown('<div class="mobile-nav">', unsafe_allow_html=True)
        mobile_page = st.selectbox(
            "Navigate",
            ["➕ Add", "🔍 Search", "📊 Browse", "🔧 Admin"],
            label_visibility="collapsed",
            key="mobile_nav"
        )
        st.markdown('</div>', unsafe_allow_html=True)

    # Use whichever value changed (both always render but one is hidden)
    page_map = {"Add": "➕ Add", "Search": "🔍 Search", "Browse": "📊 Browse", "Admin": "🔧 Admin"}
    desktop_mapped = page_map.get(desktop_page, "🔍 Search")
    # Sync: use mobile value if it differs from desktop mapping
    if mobile_page != desktop_mapped:
        page = mobile_page
    else:
        page = desktop_mapped
else:
    page = "🔍 Search"

col_user, col_signout = st.columns([4, 1])
with col_user:
    st.caption(f"{'👑' if user_is_admin else '👤'} {user_email}")
with col_signout:
    if st.button("Sign Out", use_container_width=True):
        st.session_state.user = None
        st.rerun()

# Page: Add Entry
if page == "➕ Add":
    st.subheader("Add Knowledge")
    
    # Initialize session state for attachments
    if 'attachments' not in st.session_state:
        st.session_state.attachments = []
    
    # Main text input
    content = st.text_area(
        "What do you want to save?",
        placeholder="Type or paste text here...",
        height=75,
        label_visibility="collapsed"
    )
    
    # File uploader - always visible, compact
    uploaded_files = st.file_uploader(
        "📎 Attach files",
        type=["png", "jpg", "jpeg", "gif", "csv", "pdf", "txt", "xlsx", "docx"],
        accept_multiple_files=True,
        label_visibility="collapsed"
    )
    
    if uploaded_files:
        for uploaded_file in uploaded_files:
            file_type = uploaded_file.type
            file_data = {
                'name': uploaded_file.name,
                'file': uploaded_file,
                'processed': False
            }
            
            if file_type.startswith("image/"):
                image = Image.open(uploaded_file)
                file_data['type'] = 'image'
                file_data['preview'] = image
                file_data['image'] = image
            elif file_type == "text/csv":
                file_data['type'] = 'csv'
                file_data['preview'] = None
            elif file_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
                file_data['type'] = 'xlsx'
                file_data['preview'] = None
            elif file_type == "application/pdf":
                file_data['type'] = 'pdf'
                file_data['preview'] = None
            else:
                file_data['type'] = 'text'
                file_data['preview'] = None
            
            # Avoid duplicates
            if not any(a['name'] == file_data['name'] for a in st.session_state.attachments):
                st.session_state.attachments.append(file_data)
    
    # Process and save
    if st.button("💾 Save", type="primary", use_container_width=True):
        full_content = content
        file_contents = []
        file_type = None
        file_name = None
        
        # Process attachments
        for att in st.session_state.attachments:
            if att['type'] == 'image':
                with st.spinner(f"Analyzing {att['name']}..."):
                    description = analyze_image(att['image'])
                    file_contents.append({
                        "name": att['name'],
                        "type": "image",
                        "content": description
                    })
            elif att['type'] == 'csv':
                att['file'].seek(0)
                df = pd.read_csv(att['file'])
                csv_summary = analyze_csv(df)
                file_contents.append({
                    "name": att['name'],
                    "type": "csv",
                    "content": csv_summary
                })
            elif att['type'] == 'xlsx':
                att['file'].seek(0)
                sheets = read_excel(att['file'])
                if sheets is not None:
                    # Combine all sheets into one summary
                    all_summaries = []
                    for sheet_name, df in sheets.items():
                        sheet_summary = f"[Sheet: {sheet_name}]\n{analyze_csv(df)}"
                        all_summaries.append(sheet_summary)
                    xlsx_summary = "\n\n".join(all_summaries)
                    file_contents.append({
                        "name": att['name'],
                        "type": "xlsx",
                        "content": xlsx_summary
                    })
                else:
                    file_contents.append({
                        "name": att['name'],
                        "type": "xlsx",
                        "content": "[Excel support requires openpyxl: pip install openpyxl]"
                    })
            elif att['type'] == 'pdf':
                att['file'].seek(0)
                pdf_text = read_pdf(att['file'])
                file_contents.append({
                    "name": att['name'],
                    "type": "pdf",
                    "content": pdf_text[:5000]
                })
            else:
                att['file'].seek(0)
                text = att['file'].read().decode("utf-8", errors='ignore')
                file_contents.append({
                    "name": att['name'],
                    "type": "text",
                    "content": text
                })
        
        if file_contents:
            for fc in file_contents:
                full_content += f"\n\n[{fc['type'].upper()}: {fc['name']}]\n{fc['content']}"
            file_type = file_contents[0]["type"]
            file_name = file_contents[0]["name"]
        
        if full_content.strip():
            with st.spinner("🤖 AI is analyzing..."):
                ai_analysis = analyze_content(full_content, f"{len(file_contents)} file(s)" if file_contents else None)
            
            success, message = save_entry(full_content, ai_analysis, file_type, file_name)
            
            if success:
                st.success(message)
                st.balloons()
                st.session_state.attachments = []  # Clear attachments
                
                with st.expander("🤖 AI Analysis", expanded=True):
                    if "summary" in ai_analysis:
                        st.write(f"**Summary:** {ai_analysis['summary']}")
                    if "topics" in ai_analysis:
                        st.write(f"**Topics:** {', '.join(ai_analysis['topics'])}")
                    if "category" in ai_analysis:
                        st.write(f"**Category:** {ai_analysis['category']}")
                    if "entities" in ai_analysis:
                        st.write(f"**Entities:** {', '.join(ai_analysis['entities'])}")
                    if "sentiment" in ai_analysis:
                        st.write(f"**Sentiment:** {ai_analysis['sentiment']}")
                    if "action_items" in ai_analysis and ai_analysis["action_items"]:
                        st.write("**Action Items:**")
                        for item in ai_analysis["action_items"]:
                            st.write(f"  • {item}")
            else:
                st.error(message)
        else:
            st.warning("Add some content or attach a file.")

# Page: Search
elif page == "🔍 Search":
    st.header("Search Knowledge")
    
    query = st.text_input("Ask anything...", placeholder="e.g., What feedback did we get about login?")
    
    if query:
        with st.spinner("Searching..."):
            results = search_entries(query)
        
        if results:
            st.success(f"Hittade {len(results)} resultat")
            
            # Collect data for AI summary
            summary_data = []
            unique_customers = set()
            unique_categories = set()
            
            for result in results:
                ai = result.get('ai_analysis', {}) or {}
                summary_data.append(ai.get('summary', result['content'][:100]))
                if ai.get('entities'):
                    for e in ai['entities']:
                        unique_customers.add(e)
                if ai.get('category'):
                    unique_categories.add(ai['category'])
            
            # Generate AI summary of results
            with st.spinner("Sammanfattar resultat..."):
                try:
                    summary_prompt = f"""Du är en analytiker. Användaren sökte på: "{query}"

Här är de {len(results)} matchande posterna (sammanfattningar):
{chr(10).join([f"- {s}" for s in summary_data[:10]])}

Skriv en kort, användbar sammanfattning (2-3 meningar) som svarar på frågan baserat på dessa resultat. 
Svara på svenska. Var konkret och nämn specifika detaljer eller mönster du ser."""
                    
                    response = model.generate_content(summary_prompt)
                    ai_summary = response.text
                    
                    st.info(f"💡 **Sammanfattning:** {ai_summary}")
                except Exception as e:
                    pass  # Silent fail on summary
            
            # Show stats
            col1, col2, col3 = st.columns(3)
            with col1:
                st.metric("Resultat", len(results))
            with col2:
                st.metric("Kunder/entiteter", len(unique_customers))
            with col3:
                st.metric("Kategorier", len(unique_categories))
            
            st.divider()
            
            # Display results
            for i, result in enumerate(results, 1):
                similarity = result.get('similarity', 0) * 100
                ai = result.get('ai_analysis', {}) or {}
                
                with st.container():
                    # Header row
                    header_col, score_col = st.columns([5, 1])
                    with header_col:
                        st.markdown(f"### {i}. {ai.get('summary', result['content'][:80])}")
                    with score_col:
                        # Color code similarity
                        if similarity >= 80:
                            st.success(f"**{similarity:.0f}%**")
                        elif similarity >= 70:
                            st.warning(f"**{similarity:.0f}%**")
                        else:
                            st.caption(f"{similarity:.0f}%")
                    
                    # Info row
                    info_cols = st.columns(4)
                    with info_cols[0]:
                        st.caption(f"📁 **Kategori:** {ai.get('category', 'Okänd')}")
                    with info_cols[1]:
                        if ai.get('entities'):
                            st.caption(f"🏢 **Kund:** {', '.join(ai['entities'][:2])}")
                    with info_cols[2]:
                        if ai.get('sentiment'):
                            sentiment_emoji = {"positive": "😊", "negative": "😟", "neutral": "😐", "mixed": "🤔"}.get(ai['sentiment'].lower(), "💭")
                            st.caption(f"{sentiment_emoji} **Känsla:** {ai['sentiment']}")
                    with info_cols[3]:
                        st.caption(f"📅 {result['created_at'][:10]}")
                    
                    # Tags row
                    if ai.get('topics'):
                        st.markdown(" ".join([f"`{t}`" for t in ai['topics'][:5]]))
                    
                    # Expandable content and actions
                    content_col, action_col = st.columns([5, 1])
                    with content_col:
                        with st.expander("📄 Visa fullständigt innehåll"):
                            st.write(result['content'])
                    with action_col:
                        if result.get('archived'):
                            if st.button("♻️", key=f"search_unarchive_{result['id']}", help="Återställ"):
                                supabase.table("entries").update({"archived": False}).eq("id", result['id']).execute()
                                st.rerun()
                        else:
                            if st.button("📦", key=f"search_archive_{result['id']}", help="Arkivera"):
                                supabase.table("entries").update({"archived": True}).eq("id", result['id']).execute()
                                st.rerun()
                    
                    st.divider()
        else:
            st.info("Inga resultat hittades.")

# Page: Browse
elif page == "📊 Browse":
    st.header("Browse All")
    
    # Initialize filter state
    if 'filter_category' not in st.session_state:
        st.session_state.filter_category = "Alla"
    
    # Filter options row
    filter_col1, filter_col2, filter_col3 = st.columns(3)
    with filter_col1:
        show_archived = st.checkbox("Visa arkiverade", value=False)
    
    try:
        # First get total count
        count_response = supabase.table("entries").select("id", count="exact").execute()
        total_count = count_response.count if hasattr(count_response, 'count') else len(count_response.data)
        
        if show_archived:
            response = supabase.table("entries").select("*").order("created_at", desc=True).limit(500).execute()
        else:
            response = supabase.table("entries").select("*").eq("archived", False).order("created_at", desc=True).limit(500).execute()
        
        if response.data:
            # Collect categories from entries with valid analysis
            categories = set()
            valid_count = 0
            for entry in response.data:
                ai = entry.get('ai_analysis') or {}
                if ai.get('category') and 'error' not in ai:
                    categories.add(ai['category'])
                    valid_count += 1
            
            category_options = ["Alla"] + sorted(list(categories))
            
            with filter_col2:
                filter_cat = st.selectbox(
                    "Filtrera kategori", 
                    category_options,
                    key="browse_category_filter"
                )
            with filter_col3:
                st.metric("Totalt poster", len(response.data))
                if valid_count < len(response.data):
                    st.caption(f"⚠️ {len(response.data) - valid_count} poster saknar AI-analys")
            
            # Count filtered entries
            filtered_entries = [e for e in response.data if filter_cat == "Alla" or (e.get('ai_analysis') or {}).get('category') == filter_cat]
            
            if filter_cat != "Alla":
                st.info(f"Visar {len(filtered_entries)} av {len(response.data)} poster i kategori '{filter_cat}'")
            
            for entry in filtered_entries:
                ai = entry.get('ai_analysis') or {}
                
                with st.container():
                    entry_col1, entry_col2, entry_col3 = st.columns([4, 1, 1])
                    with entry_col1:
                        st.write(f"**{ai.get('category', 'Entry')}**")
                        st.write(ai.get('summary', entry['content'][:200]))
                        if ai.get('topics'):
                            st.caption(f"🏷️ {', '.join(ai['topics'][:5])}")
                    with entry_col2:
                        st.caption(entry['created_at'][:10])
                        if entry.get('file_type'):
                            st.caption(f"📎 {entry['file_type']}")
                        if entry.get('archived'):
                            st.caption("📦 Arkiverad")
                    with entry_col3:
                        # Archive/Unarchive button
                        if entry.get('archived'):
                            if st.button("♻️", key=f"unarchive_{entry['id']}", help="Återställ"):
                                supabase.table("entries").update({"archived": False}).eq("id", entry['id']).execute()
                                st.rerun()
                        else:
                            if st.button("📦", key=f"archive_{entry['id']}", help="Arkivera"):
                                supabase.table("entries").update({"archived": True}).eq("id", entry['id']).execute()
                                st.rerun()
                        # Delete button
                        if st.button("🗑️", key=f"delete_{entry['id']}", help="Ta bort permanent"):
                            supabase.table("entries").delete().eq("id", entry['id']).execute()
                            st.rerun()
                    st.divider()
        else:
            st.info("No entries yet. Add some knowledge!")
            
    except Exception as e:
        st.error(f"Error: {e}")

# Page: Admin
elif page == "🔧 Admin":
    st.header("Admin Tools")
    
    st.info(f"🔧 Using model: **{MODEL_NAME}**")
    
    # List available models
    if st.button("Show available Gemini models"):
        try:
            for m in genai.list_models():
                if 'generateContent' in m.supported_generation_methods:
                    st.write(f"- {m.name}")
        except Exception as e:
            st.error(f"Error listing models: {e}")
    
    # List embedding models
    if st.button("Show available embedding models"):
        try:
            for m in genai.list_models():
                if 'embedContent' in m.supported_generation_methods:
                    st.write(f"- {m.name}")
        except Exception as e:
            st.error(f"Error listing models: {e}")
    
    st.subheader("Re-analyze entries with errors")
    
    try:
        # Find entries with errors in ai_analysis
        response = supabase.table("entries").select("*").order("created_at", desc=True).execute()
        
        if response.data:
            error_entries = []
            for entry in response.data:
                ai = entry.get('ai_analysis') or {}
                if ai.get('error') or not ai.get('category'):
                    error_entries.append(entry)
            
            if error_entries:
                st.warning(f"Found {len(error_entries)} entries with missing/failed AI analysis")
                
                if st.button("🔄 Re-analyze all (slow - 5s delay)", type="primary"):
                    progress = st.progress(0)
                    for i, entry in enumerate(error_entries):
                        with st.spinner(f"Analyzing {i+1}/{len(error_entries)}... (väntar 5s mellan varje)"):
                            # Wait between requests to avoid rate limiting
                            if i > 0:
                                time.sleep(5)
                            
                            new_analysis = analyze_content(entry['content'])
                            
                            # Only update if successful (no error)
                            if 'error' not in new_analysis:
                                supabase.table("entries").update({
                                    "ai_analysis": new_analysis
                                }).eq("id", entry['id']).execute()
                                st.caption(f"✅ Entry {i+1}: {new_analysis.get('category', 'OK')}")
                            else:
                                st.caption(f"❌ Entry {i+1}: {new_analysis.get('error', '')[:100]}")
                        
                        progress.progress((i + 1) / len(error_entries))
                    
                    st.success("✅ All entries re-analyzed!")
                    st.button("Reload page")
                
                # Show entries with errors
                for entry in error_entries:
                    ai = entry.get('ai_analysis') or {}
                    with st.expander(f"❌ {entry['content'][:50]}..."):
                        st.write(f"**Error:** {ai.get('error', 'No category')}")
                        st.write(f"**Content:** {entry['content'][:300]}...")
                        
                        if st.button("Re-analyze this one", key=f"reanalyze_{entry['id']}"):
                            with st.spinner("Analyzing..."):
                                new_analysis = analyze_content(entry['content'])
                                supabase.table("entries").update({
                                    "ai_analysis": new_analysis
                                }).eq("id", entry['id']).execute()
                            st.success("Done!")
                            st.rerun()
            else:
                st.success("✅ All entries have valid AI analysis!")
        else:
            st.info("No entries in database.")
            
    except Exception as e:
        st.error(f"Error: {e}")
    
    # Regenerate embeddings section
    st.subheader("Regenerate embeddings")
    
    try:
        response = supabase.table("entries").select("id, content, embedding").execute()
        if response.data:
            missing_embeddings = [e for e in response.data if e.get('embedding') is None]
            
            if missing_embeddings:
                st.warning(f"Found {len(missing_embeddings)} entries without embeddings")
                
                if st.button("🔄 Generate embeddings", type="primary"):
                    progress = st.progress(0)
                    for i, entry in enumerate(missing_embeddings):
                        with st.spinner(f"Generating embedding {i+1}/{len(missing_embeddings)}..."):
                            embedding = generate_embedding(entry['content'])
                            if embedding:
                                supabase.table("entries").update({
                                    "embedding": embedding
                                }).eq("id", entry['id']).execute()
                                st.write(f"✅ Entry {i+1}: Embedding generated")
                            else:
                                st.write(f"❌ Entry {i+1}: Failed to generate embedding")
                        progress.progress((i + 1) / len(missing_embeddings))
                    st.success("Done!")
            else:
                st.success("✅ All entries have embeddings!")
    except Exception as e:
        st.error(f"Error: {e}")
    
    # Excel bulk import
    st.subheader("📊 Bulk import from Excel")
    st.write("Import Excel-filer där varje rad blir en separat post")
    
    excel_file = st.file_uploader("Välj Excel-fil", type=["xlsx"], key="excel_import")
    
    if excel_file:
        try:
            sheets = read_excel(excel_file)
            if sheets:
                sheet_names = list(sheets.keys())
                selected_sheet = st.selectbox("Välj flik", sheet_names)
                
                df = sheets[selected_sheet]
                st.write(f"**{len(df)} rader, {len(df.columns)} kolumner**")
                st.dataframe(df.head(10))
                
                # Select which column contains the main content
                content_col = st.selectbox("Vilken kolumn innehåller huvudtexten?", df.columns.tolist())
                
                # Optional: select additional columns to include
                other_cols = [c for c in df.columns if c != content_col]
                include_cols = st.multiselect("Inkludera extra kolumner i varje post?", other_cols)
                
                if st.button(f"📥 Importera {len(df)} rader som separata poster", type="primary"):
                    progress = st.progress(0)
                    success_count = 0
                    
                    for i, row in df.iterrows():
                        main_content = str(row[content_col])
                        
                        # Skip empty rows
                        if not main_content or main_content.strip() == '' or main_content == 'nan':
                            continue
                        
                        # Add extra columns if selected
                        if include_cols:
                            extra_info = "\n".join([f"{col}: {row[col]}" for col in include_cols if pd.notna(row[col])])
                            full_content = f"{main_content}\n\n{extra_info}" if extra_info else main_content
                        else:
                            full_content = main_content
                        
                        with st.spinner(f"Importerar rad {i+1}..."):
                            # Rate limiting - wait 5 seconds between requests
                            if i > 0:
                                time.sleep(5)
                            
                            # Analyze with AI
                            ai_analysis = analyze_content(full_content)
                            
                            # Wait before embedding
                            time.sleep(2)
                            
                            # Generate embedding
                            embedding = generate_embedding(full_content)
                            
                            # Save to database
                            data = {
                                "user_id": st.session_state.user.user.id,
                                "content": full_content,
                                "ai_analysis": ai_analysis,
                                "file_type": "xlsx",
                                "file_name": excel_file.name,
                                "embedding": embedding,
                                "created_at": datetime.utcnow().isoformat()
                            }
                            
                            try:
                                supabase.table("entries").insert(data).execute()
                                success_count += 1
                            except Exception as e:
                                st.error(f"Rad {i+1} fel: {e}")
                        
                        progress.progress((i + 1) / len(df))
                    
                    st.success(f"✅ Importerade {success_count} poster!")
                    st.balloons()
            else:
                st.error("Kunde inte läsa Excel-filen. Installera openpyxl: pip install openpyxl")
        except Exception as e:
            st.error(f"Fel vid läsning: {e}")

st.markdown("---")
st.caption("KnowledgeHub • AI-powered knowledge capture")
