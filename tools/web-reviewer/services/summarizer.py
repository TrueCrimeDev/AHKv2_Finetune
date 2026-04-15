"""
Summarizer service - AI-powered script analysis and summarization.
Uses OpenRouter API for model access.
"""

import os
import requests
from typing import Dict, Any


class SummarizerService:
    def __init__(self):
        self.api_key = os.environ.get("OPENROUTER_API_KEY")
        self.base_url = "https://openrouter.ai/api/v1/chat/completions"
        self.model = "anthropic/claude-haiku-4.5"

    def is_available(self) -> bool:
        """Check if AI summarization is available"""
        return self.api_key is not None

    async def summarize_script(self, content: str, filename: str, diagnostics: list = None) -> Dict[str, Any]:
        """Generate an AI summary of what the script does"""
        if not self.is_available():
            return {
                "success": False,
                "error": "AI not available. Set OPENROUTER_API_KEY environment variable."
            }

        # Build context about the script
        diag_summary = ""
        if diagnostics:
            errors = [d for d in diagnostics if d.get("severity") == 1]
            warnings = [d for d in diagnostics if d.get("severity") == 2]
            if errors or warnings:
                diag_summary = f"\n\nLint results: {len(errors)} errors, {len(warnings)} warnings."
                if errors[:3]:
                    diag_summary += "\nTop errors: " + "; ".join(e.get("message", "")[:100] for e in errors[:3])

        prompt = f"""Analyze this AutoHotkey v2 script and provide a concise summary plus rule compliance check.

Script: {filename}
{diag_summary}

```ahk
{content[:8000]}
```

## RULES TO CHECK:

**Required (from AGENTS.md):**
1. Has `#Requires AutoHotkey v2.0` header
2. Has `#SingleInstance Force` (or documented exception)
3. Has clear description at top (comment or docblock)
4. Uses pure AHK v2 syntax (no v1 commands like `MsgBox, Hello`)
5. Is standalone or has explicit `#Include` declarations

**Coding Standards:**
6. Uses Map() for key-value data (not object literals)
7. Fat arrow `=>` only for single-line expressions (no multiline blocks)
8. Event handlers use `.Bind(this)` pattern (not inline arrow functions)
9. No JavaScript patterns (const, let, ===, template literals)
10. No empty catch blocks
11. Proper variable scoping (explicit declarations)

Provide a response in this exact format:

**Purpose:** [1-2 sentences describing what this script does]

**Key Features:**
- [Feature 1]
- [Feature 2]
- [Feature 3]

**Rule Compliance:**
- [PASS/FAIL] #Requires header
- [PASS/FAIL] #SingleInstance
- [PASS/FAIL] Description at top
- [PASS/FAIL] Pure v2 syntax
- [PASS/FAIL] Standalone/includes declared
- [PASS/FAIL] Map() usage (or N/A if no key-value data)
- [PASS/FAIL] Arrow syntax correct
- [PASS/FAIL] Event binding correct (or N/A)
- [PASS/FAIL] No JS contamination
- [PASS/FAIL] Error handling (or N/A)

**Issues Found:** [List specific violations if any, or "None"]

Keep the response concise."""

        try:
            response = requests.post(
                url=self.base_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://github.com/ahk-finetune",
                    "X-Title": "AHK Training Reviewer",
                },
                json={
                    "model": self.model,
                    "max_tokens": 800,
                    "messages": [
                        {"role": "user", "content": prompt}
                    ]
                },
                timeout=30
            )

            response.raise_for_status()
            data = response.json()

            summary = data["choices"][0]["message"]["content"]

            return {
                "success": True,
                "summary": summary,
                "model": self.model
            }

        except requests.exceptions.RequestException as e:
            # Try to extract error message from response
            error_msg = str(e)
            try:
                if hasattr(e, 'response') and e.response is not None:
                    error_data = e.response.json()
                    if 'error' in error_data and 'message' in error_data['error']:
                        error_msg = error_data['error']['message']
            except:
                pass
            return {
                "success": False,
                "error": f"API error: {error_msg}"
            }
        except (KeyError, IndexError) as e:
            return {
                "success": False,
                "error": f"Unexpected API response format: {str(e)}"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    async def chat(self, query: str, context_scripts: list) -> Dict[str, Any]:
        """RAG-style chat: answer questions using retrieved script context"""
        if not self.is_available():
            return {
                "success": False,
                "error": "AI not available. Set OPENROUTER_API_KEY environment variable."
            }

        # Build context from retrieved scripts
        context_parts = []
        for script in context_scripts[:5]:  # Limit to 5 most relevant
            content = script.get("content", "")[:3000]  # Truncate long scripts
            context_parts.append(f"""
--- {script.get('filename', 'Unknown')} ({script.get('category', '')}) ---
```ahk
{content}
```
""")

        context_text = "\n".join(context_parts)

        prompt = f"""You are an AutoHotkey v2 expert assistant. Use the example scripts below as reference to answer the user's question or generate code.

## REFERENCE SCRIPTS (from training dataset):
{context_text}

## AHK V2 RULES TO FOLLOW:
- Always include `#Requires AutoHotkey v2.0` header
- Use `#SingleInstance Force` unless there's a reason not to
- Use `:=` for assignment (never `=`)
- Arrays are 1-indexed (not 0)
- Use function syntax: `MsgBox("text")` not `MsgBox, text`
- GUI is object-based: `myGui := Gui()`
- Use `Map()` for key-value data
- Fat arrow `=>` only for single-line expressions
- Event handlers use `.Bind(this)` pattern

## USER QUESTION:
{query}

## INSTRUCTIONS:
- If generating code, provide complete, working examples
- Reference patterns from the example scripts when relevant
- Explain your code with comments
- Keep responses focused and practical"""

        try:
            response = requests.post(
                url=self.base_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://github.com/ahk-finetune",
                    "X-Title": "AHK Training Reviewer",
                },
                json={
                    "model": self.model,
                    "max_tokens": 4000,
                    "messages": [
                        {"role": "user", "content": prompt}
                    ]
                },
                timeout=90
            )

            response.raise_for_status()
            data = response.json()

            reply = data["choices"][0]["message"]["content"]

            return {
                "success": True,
                "response": reply,
                "model": self.model,
                "context_count": len(context_scripts)
            }

        except requests.exceptions.RequestException as e:
            error_msg = str(e)
            try:
                if hasattr(e, 'response') and e.response is not None:
                    error_data = e.response.json()
                    if 'error' in error_data and 'message' in error_data['error']:
                        error_msg = error_data['error']['message']
            except:
                pass
            return {
                "success": False,
                "error": f"API error: {error_msg}"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
