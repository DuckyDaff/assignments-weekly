import { StrictMode, Component } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <div dir="rtl" style={{ background: "#080c18", color: "#e74c3c", fontFamily: "monospace", padding: 32, minHeight: "100vh" }}>
          <div style={{ fontSize: 22, marginBottom: 12 }}>⚠️ שגיאה בטעינה</div>
          <pre style={{ background: "#0f1525", padding: 16, borderRadius: 8, color: "#ff6b6b", fontSize: 13, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {this.state.error?.message || String(this.state.error)}
            {"\n\n"}
            {this.state.error?.stack}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: "10px 20px", background: "#4a9eff", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 14 }}>
            רענן דף
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
