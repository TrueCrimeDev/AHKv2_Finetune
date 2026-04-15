"""
Linter service - integration with ahk-linter.
"""

import asyncio
import json
from pathlib import Path
from typing import Dict, Any


class LinterService:
    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.linter_dir = project_root / "tools" / "ahk-linter"

    async def lint_file(self, file_path: str) -> Dict[str, Any]:
        """Run linter on a single file"""
        try:
            # Run the linter via npx
            cmd = f'npx ts-node index.ts lint "path={file_path}" --format=json'

            process = await asyncio.create_subprocess_shell(
                cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(self.linter_dir)
            )

            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                # Linter might still output valid JSON even with non-zero exit
                pass

            # Parse output
            output = stdout.decode("utf-8").strip()

            if not output:
                return {"errors": 0, "warnings": 0, "info": 0, "hints": 0, "diagnostics": []}

            # Try to parse JSON output
            try:
                result = json.loads(output)

                # Handle different output formats
                if isinstance(result, list):
                    # Array of diagnostics
                    diagnostics = result
                    file_summary = None
                elif isinstance(result, dict):
                    # New format: {files: [{file, diagnostics, summary}], summary}
                    if "files" in result and len(result["files"]) > 0:
                        file_data = result["files"][0]
                        diagnostics = file_data.get("diagnostics", [])
                        file_summary = file_data.get("summary", {})
                    else:
                        diagnostics = result.get("diagnostics", result.get("results", []))
                        file_summary = None
                else:
                    diagnostics = []
                    file_summary = None

                # Count by severity (use file summary if available, otherwise count manually)
                if file_summary:
                    errors = file_summary.get("errors", 0)
                    warnings = file_summary.get("warnings", 0)
                    info = file_summary.get("info", 0)
                    hints = file_summary.get("hints", 0)
                else:
                    errors = sum(1 for d in diagnostics if d.get("severity") == "error" or d.get("severity") == 1)
                    warnings = sum(1 for d in diagnostics if d.get("severity") == "warning" or d.get("severity") == 2)
                    info = sum(1 for d in diagnostics if d.get("severity") == "info" or d.get("severity") == 3)
                    hints = sum(1 for d in diagnostics if d.get("severity") == "hint" or d.get("severity") == 4)

                return {
                    "errors": errors,
                    "warnings": warnings,
                    "info": info,
                    "hints": hints,
                    "diagnostics": diagnostics[:100]  # Limit to first 100
                }

            except json.JSONDecodeError:
                # If not JSON, try to parse text output
                lines = output.split("\n")
                errors = sum(1 for line in lines if "error" in line.lower())
                warnings = sum(1 for line in lines if "warning" in line.lower())

                return {
                    "errors": errors,
                    "warnings": warnings,
                    "diagnostics": [],
                    "raw_output": output[:2000]
                }

        except Exception as e:
            return {
                "errors": 0,
                "warnings": 0,
                "info": 0,
                "hints": 0,
                "diagnostics": [],
                "error": str(e)
            }

    async def lint_files(self, file_paths: list) -> Dict[str, Dict[str, Any]]:
        """Lint multiple files"""
        results = {}
        for path in file_paths:
            results[path] = await self.lint_file(path)
        return results
