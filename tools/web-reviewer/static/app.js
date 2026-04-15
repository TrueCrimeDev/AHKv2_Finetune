/**
 * AHK Training Reviewer - Main Application (Monaco Edition)
 */

// State
const state = {
    scripts: [],
    filteredScripts: [],
    currentScript: null,
    currentIndex: -1,
    isEditing: false,
    isReviewMode: false,
    fixResult: null,
    categories: [],
    monaco: null,
    editor: null,
    diffOriginalEditor: null,
    diffFixedEditor: null
};

// DOM Elements
const elements = {
    // Stats
    statTotal: document.getElementById('stat-total'),
    statReviewed: document.getElementById('stat-reviewed'),
    statProgress: document.getElementById('stat-progress'),

    // Filters
    filterCategory: document.getElementById('filter-category'),
    filterStatus: document.getElementById('filter-status'),
    filterQuality: document.getElementById('filter-quality'),

    // Script list
    scriptList: document.getElementById('script-list'),

    // Script viewer
    scriptTitle: document.getElementById('script-title'),
    scriptCategory: document.getElementById('script-category'),
    scriptStatus: document.getElementById('script-status'),
    scriptQuality: document.getElementById('script-quality'),
    monacoContainer: document.getElementById('monaco-container'),

    // Buttons
    btnRun: document.getElementById('btn-run'),
    btnLint: document.getElementById('btn-lint'),
    btnEdit: document.getElementById('btn-edit'),
    btnSave: document.getElementById('btn-save'),
    btnCancelEdit: document.getElementById('btn-cancel-edit'),
    btnFix: document.getElementById('btn-fix'),
    btnReviewMode: document.getElementById('btn-review-mode'),
    btnRefresh: document.getElementById('btn-refresh'),
    fixLevel: document.getElementById('fix-level'),

    // Problems panel
    problemsPanel: document.getElementById('problems-panel'),
    problemsCount: document.getElementById('problems-count'),
    problemsList: document.getElementById('problems-list'),
    problemsContent: document.getElementById('problems-content'),
    errorCount: document.getElementById('error-count'),
    warningCount: document.getElementById('warning-count'),
    btnToggleProblems: document.getElementById('btn-toggle-problems'),

    // Diff viewer
    diffViewer: document.getElementById('diff-viewer'),
    diffOriginalContainer: document.getElementById('diff-original-monaco'),
    diffFixedContainer: document.getElementById('diff-fixed-monaco'),
    btnAcceptFix: document.getElementById('btn-accept-fix'),
    btnRejectFix: document.getElementById('btn-reject-fix'),

    // Script viewer container
    scriptViewer: document.getElementById('script-viewer'),

    // Review mode
    reviewModeOverlay: document.getElementById('review-mode-overlay'),
    reviewModeProgress: document.getElementById('review-mode-progress'),
    btnExitReview: document.getElementById('btn-exit-review'),

    // Loading & Toast
    loading: document.getElementById('loading'),
    loadingText: document.getElementById('loading-text'),
    toastContainer: document.getElementById('toast-container')
};

// API helpers
async function api(endpoint, options = {}) {
    const response = await fetch(`/api${endpoint}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || 'Request failed');
    }
    return response.json();
}

function showLoading(text = 'Loading...') {
    elements.loadingText.textContent = text;
    elements.loading.classList.remove('hidden');
}

function hideLoading() {
    elements.loading.classList.add('hidden');
}

function toast(message, type = 'success') {
    const div = document.createElement('div');
    div.className = `toast ${type}`;
    div.textContent = message;
    elements.toastContainer.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

// Monaco Editor Setup
async function setupMonaco() {
    state.monaco = await window.initMonaco();

    // Create main editor
    state.editor = state.monaco.editor.create(elements.monacoContainer, {
        value: '// Select a script from the list',
        language: window.AHK_LANGUAGE_ID,
        theme: window.AHK_THEME_NAME,
        readOnly: true,
        automaticLayout: true,
        fontSize: 14,
        lineNumbers: 'on',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        renderWhitespace: 'selection'
    });

    // Create diff editors
    state.diffOriginalEditor = state.monaco.editor.create(elements.diffOriginalContainer, {
        value: '',
        language: window.AHK_LANGUAGE_ID,
        theme: window.AHK_THEME_NAME,
        readOnly: true,
        automaticLayout: true,
        fontSize: 13,
        lineNumbers: 'on',
        minimap: { enabled: false },
        scrollBeyondLastLine: false
    });

    state.diffFixedEditor = state.monaco.editor.create(elements.diffFixedContainer, {
        value: '',
        language: window.AHK_LANGUAGE_ID,
        theme: window.AHK_THEME_NAME,
        readOnly: true,
        automaticLayout: true,
        fontSize: 13,
        lineNumbers: 'on',
        minimap: { enabled: false },
        scrollBeyondLastLine: false
    });

    // Ctrl+S to save when editing
    state.editor.addCommand(state.monaco.KeyMod.CtrlCmd | state.monaco.KeyCode.KeyS, () => {
        if (state.isEditing) {
            saveScript();
        }
    });
}

// Load data
async function loadScripts() {
    const category = elements.filterCategory.value;
    const status = elements.filterStatus.value;
    const quality = elements.filterQuality.value;

    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (status) params.append('status', status);
    if (quality) params.append('quality', quality);

    const data = await api(`/scripts?${params}`);
    state.scripts = data.scripts;
    state.filteredScripts = data.scripts;
    renderScriptList();
}

async function loadCategories() {
    const data = await api('/categories');
    state.categories = data.categories;

    elements.filterCategory.innerHTML = '<option value="">All Categories</option>';
    for (const cat of state.categories) {
        const option = document.createElement('option');
        option.value = cat.name;
        option.textContent = `${cat.name} (${cat.total})`;
        elements.filterCategory.appendChild(option);
    }
}

async function loadStats() {
    const data = await api('/stats');
    elements.statTotal.textContent = data.total;
    elements.statReviewed.textContent = data.reviewed;
    elements.statProgress.textContent = `${data.review_progress}%`;
}

function renderScriptList() {
    elements.scriptList.innerHTML = '';

    for (let i = 0; i < state.filteredScripts.length; i++) {
        const script = state.filteredScripts[i];
        const div = document.createElement('div');
        div.className = 'script-item' + (state.currentScript?.id === script.id ? ' active' : '');
        div.dataset.index = i;

        div.innerHTML = `
            <div class="filename">${script.filename}</div>
            <div class="meta">
                <span class="badge badge-${script.status}">${script.status}</span>
                <span class="badge badge-${script.quality}">${script.quality}</span>
            </div>
        `;

        div.addEventListener('click', () => selectScript(i));
        elements.scriptList.appendChild(div);
    }
}

async function selectScript(index) {
    if (index < 0 || index >= state.filteredScripts.length) return;

    state.currentIndex = index;
    const scriptSummary = state.filteredScripts[index];

    showLoading('Loading script...');

    try {
        // Load full script details
        const script = await api(`/scripts/${encodeURIComponent(scriptSummary.id)}`);
        const contentData = await api(`/script-content/${encodeURIComponent(scriptSummary.id)}`);

        state.currentScript = { ...script, content: contentData.content };

        // Update UI
        elements.scriptTitle.textContent = script.filename;
        elements.scriptCategory.textContent = script.category;
        elements.scriptCategory.className = 'badge';
        elements.scriptStatus.textContent = script.status;
        elements.scriptStatus.className = `badge badge-${script.status}`;
        elements.scriptQuality.textContent = script.quality;
        elements.scriptQuality.className = `badge badge-${script.quality}`;

        // Update Monaco editor
        if (state.editor) {
            state.editor.setValue(contentData.content);
            state.editor.updateOptions({ readOnly: true });
        }

        // Show lint results if available
        if (script.lint_results && script.lint_results.length > 0) {
            showProblemsPanel(script.lint_results);
        } else {
            clearProblemsPanel();
        }

        // Reset edit mode
        exitEditMode();

        // Hide diff viewer
        elements.diffViewer.classList.add('hidden');
        elements.scriptViewer.classList.remove('hidden');

        // Update list selection
        renderScriptList();

        // Scroll to active item
        const activeItem = elements.scriptList.querySelector('.active');
        if (activeItem) {
            activeItem.scrollIntoView({ block: 'nearest' });
        }

        // Update review mode progress
        if (state.isReviewMode) {
            elements.reviewModeProgress.textContent = `${index + 1} / ${state.filteredScripts.length}`;
        }

    } catch (error) {
        toast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Problems panel functions
function showProblemsPanel(diagnostics) {
    if (!elements.problemsList) return;

    const errors = diagnostics.filter(d => d.severity === 1).length;
    const warnings = diagnostics.filter(d => d.severity !== 1).length;
    const total = diagnostics.length;

    // Update counts
    if (elements.errorCount) elements.errorCount.textContent = errors;
    if (elements.warningCount) elements.warningCount.textContent = warnings;
    if (elements.problemsCount) {
        elements.problemsCount.textContent = total;
        elements.problemsCount.className = 'problems-count' +
            (errors > 0 ? ' has-errors' : (warnings > 0 ? ' has-warnings' : ''));
    }

    // Build problems list
    if (diagnostics.length === 0) {
        elements.problemsList.innerHTML = '<div class="problems-empty">No problems detected ✓</div>';
        return;
    }

    elements.problemsList.innerHTML = '';

    // Sort by severity (errors first), then by line number
    const sorted = [...diagnostics].sort((a, b) => {
        if (a.severity !== b.severity) return a.severity - b.severity;
        const lineA = a.range?.start?.line || a.line || 0;
        const lineB = b.range?.start?.line || b.line || 0;
        return lineA - lineB;
    });

    // Get source code lines for context
    const sourceLines = state.editor ? state.editor.getValue().split('\n') : [];

    for (const diag of sorted) {
        const line = diag.range?.start?.line || diag.line || '?';
        const col = diag.range?.start?.character || diag.column || 1;
        const endCol = diag.range?.end?.character || col;
        const severity = diag.severity === 1 ? 'error' : (diag.severity === 2 ? 'warning' : 'info');
        const severityIcon = diag.severity === 1 ? '❌' : (diag.severity === 2 ? '⚠️' : 'ℹ️');
        const code = diag.code || '';
        const source = diag.source || 'ahk2';

        // Get the actual source line
        const lineNum = typeof line === 'number' ? line : parseInt(line, 10) || 0;
        const sourceLine = lineNum > 0 && lineNum <= sourceLines.length ? sourceLines[lineNum - 1] : '';

        const div = document.createElement('div');
        div.className = `problem-item ${severity}`;
        div.innerHTML = `
            <div class="problem-header">
                <span class="problem-icon">${severityIcon}</span>
                <span class="problem-location">
                    <span class="problem-line">Line ${line}:${col}</span>
                    ${code ? `<span class="problem-code">[${code}]</span>` : ''}
                </span>
                <span class="problem-source-tag">${source}</span>
            </div>
            <div class="problem-message">${escapeHtml(diag.message || 'Unknown issue')}</div>
            ${sourceLine ? `<div class="problem-snippet"><code>${escapeHtml(sourceLine.trim())}</code></div>` : ''}
        `;

        // Click to go to line
        div.addEventListener('click', () => {
            if (state.editor) {
                const ln = typeof line === 'number' ? line : parseInt(line, 10) || 1;
                const cn = typeof col === 'number' ? col : parseInt(col, 10) || 1;
                state.editor.revealLineInCenter(ln);
                state.editor.setPosition({ lineNumber: ln, column: cn });
                state.editor.focus();
            }
        });

        elements.problemsList.appendChild(div);
    }
}

function clearProblemsPanel() {
    if (elements.problemsList) {
        elements.problemsList.innerHTML = '<div class="problems-empty">Click "Lint" to analyze the script</div>';
    }
    if (elements.problemsCount) {
        elements.problemsCount.textContent = '0';
        elements.problemsCount.className = 'problems-count';
    }
    if (elements.errorCount) elements.errorCount.textContent = '0';
    if (elements.warningCount) elements.warningCount.textContent = '0';
}

function toggleProblemsPanel() {
    if (elements.problemsPanel) {
        elements.problemsPanel.classList.toggle('collapsed');
        // Trigger Monaco editor resize
        if (state.editor) {
            setTimeout(() => state.editor.layout(), 200);
        }
    }
}

// Panel resize functionality
function initPanelResize() {
    const panel = document.getElementById('problems-panel');
    const handle = document.getElementById('panel-resize-handle');
    if (!panel || !handle) return;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = panel.offsetWidth;
        handle.classList.add('dragging');
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const diff = startX - e.clientX;
        const newWidth = Math.min(800, Math.max(300, startWidth + diff));
        panel.style.width = newWidth + 'px';

        // Trigger Monaco editor resize
        if (state.editor) {
            state.editor.layout();
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            handle.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Tab switching
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.panel-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });
}

// Full Analysis - runs lint + structure analysis + metrics
async function analyzeStructure() {
    if (!state.currentScript || !state.editor) return;

    const statusEl = document.getElementById('analysis-status');
    if (statusEl) statusEl.textContent = 'Analyzing...';

    // First run lint to get latest diagnostics
    try {
        const result = await api(`/script-lint/${encodeURIComponent(state.currentScript.id)}`, {
            method: 'POST'
        });
        state.currentScript.lint_results = result.diagnostics;
        state.currentScript.errors = result.errors;
        state.currentScript.warnings = result.warnings;

        // Update problems panel too
        showProblemsPanel(result.diagnostics || []);

        // Update quality badge
        let quality = 'good';
        if (result.errors > 0) quality = 'error';
        else if (result.warnings > 0) quality = 'warning';
        elements.scriptQuality.textContent = quality;
        elements.scriptQuality.className = `badge badge-${quality}`;

    } catch (e) {
        console.error('Lint failed:', e);
    }

    const content = state.editor.getValue();
    const structure = parseAHKStructure(content);
    const diagnostics = state.currentScript.lint_results || [];
    const metrics = calculateMetrics(content, structure, diagnostics);

    renderFullAnalysis(structure, diagnostics, metrics);

    if (statusEl) statusEl.textContent = '';
}

function parseAHKStructure(code) {
    const structure = {
        classes: [],
        functions: [],
        hotkeys: [],
        hotstrings: [],
        variables: []
    };

    const lines = code.split('\n');
    let currentClass = null;
    let braceDepth = 0;
    let classStartDepth = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;
        const trimmed = line.trim();

        // Track brace depth
        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;

        // Class detection
        const classMatch = trimmed.match(/^class\s+(\w+)(?:\s+extends\s+(\w+))?/i);
        if (classMatch) {
            currentClass = {
                name: classMatch[1],
                extends: classMatch[2] || null,
                line: lineNum,
                methods: [],
                properties: []
            };
            structure.classes.push(currentClass);
            classStartDepth = braceDepth;
        }

        // Update brace depth after checking class
        braceDepth += openBraces - closeBraces;

        // Check if we exited the class
        if (currentClass && braceDepth <= classStartDepth && closeBraces > 0) {
            currentClass = null;
        }

        // Method/Function detection (inside class)
        if (currentClass) {
            const methodMatch = trimmed.match(/^(\w+)\s*\([^)]*\)\s*(?:\{|=>)?/);
            if (methodMatch && !trimmed.startsWith('if') && !trimmed.startsWith('while') && !trimmed.startsWith('for')) {
                currentClass.methods.push({
                    name: methodMatch[1],
                    line: lineNum,
                    isStatic: trimmed.toLowerCase().startsWith('static ')
                });
            }

            // Property detection
            const propMatch = trimmed.match(/^(\w+)\s*:=/);
            if (propMatch) {
                currentClass.properties.push({
                    name: propMatch[1],
                    line: lineNum
                });
            }
        } else {
            // Standalone function detection
            const funcMatch = trimmed.match(/^(\w+)\s*\([^)]*\)\s*\{?$/);
            if (funcMatch && !trimmed.startsWith('if') && !trimmed.startsWith('while') && !trimmed.startsWith('for')) {
                structure.functions.push({
                    name: funcMatch[1],
                    line: lineNum
                });
            }
        }

        // Hotkey detection
        const hotkeyMatch = trimmed.match(/^([#!^+<>*~$]+)?([a-zA-Z0-9]+|[^\s:]+)::/);
        if (hotkeyMatch && !trimmed.includes('::=')) {
            structure.hotkeys.push({
                key: hotkeyMatch[0].replace('::', ''),
                line: lineNum
            });
        }

        // Hotstring detection
        const hotstringMatch = trimmed.match(/^:([^:]*):([^:]+)::/);
        if (hotstringMatch) {
            structure.hotstrings.push({
                trigger: hotstringMatch[2],
                options: hotstringMatch[1],
                line: lineNum
            });
        }
    }

    return structure;
}

function renderStructureDiagram(structure, diagnostics) {
    const container = document.getElementById('structure-diagram');
    if (!container) return;

    // Create a problem map for quick lookup
    const problemLines = new Map();
    for (const diag of diagnostics) {
        const line = diag.range?.start?.line || diag.line;
        if (line) {
            if (!problemLines.has(line)) {
                problemLines.set(line, []);
            }
            problemLines.set(line, [...problemLines.get(line), diag]);
        }
    }

    // Build tree view (more reliable than Mermaid for complex structures)
    let html = '<div class="structure-tree">';

    // Classes
    for (const cls of structure.classes) {
        const hasError = hasProblemsNearLine(cls.line, problemLines, 5);
        html += `<div class="tree-node tree-class ${hasError}" data-line="${cls.line}">`;
        html += `📦 class ${cls.name}`;
        if (cls.extends) html += ` extends ${cls.extends}`;
        html += `</div>`;

        for (const method of cls.methods) {
            const methodError = hasProblemsNearLine(method.line, problemLines, 3);
            html += `<div class="tree-node tree-method ${methodError}" data-line="${method.line}">`;
            html += `${method.isStatic ? '⚡' : '🔹'} ${method.name}()`;
            html += `</div>`;
        }

        for (const prop of cls.properties) {
            const propError = hasProblemsNearLine(prop.line, problemLines, 2);
            html += `<div class="tree-node tree-property ${propError}" data-line="${prop.line}">`;
            html += `📌 ${prop.name}`;
            html += `</div>`;
        }
    }

    // Functions
    if (structure.functions.length > 0) {
        html += `<div class="tree-node" style="margin-top: 10px; color: var(--text-secondary);">Functions</div>`;
        for (const func of structure.functions) {
            const funcError = hasProblemsNearLine(func.line, problemLines, 3);
            html += `<div class="tree-node tree-function ${funcError}" data-line="${func.line}">`;
            html += `🔧 ${func.name}()`;
            html += `</div>`;
        }
    }

    // Hotkeys
    if (structure.hotkeys.length > 0) {
        html += `<div class="tree-node" style="margin-top: 10px; color: var(--text-secondary);">Hotkeys</div>`;
        for (const hk of structure.hotkeys) {
            const hkError = hasProblemsNearLine(hk.line, problemLines, 2);
            html += `<div class="tree-node tree-hotkey ${hkError}" data-line="${hk.line}">`;
            html += `⌨️ ${hk.key}`;
            html += `</div>`;
        }
    }

    // Hotstrings
    if (structure.hotstrings.length > 0) {
        html += `<div class="tree-node" style="margin-top: 10px; color: var(--text-secondary);">Hotstrings</div>`;
        for (const hs of structure.hotstrings) {
            const hsError = hasProblemsNearLine(hs.line, problemLines, 2);
            html += `<div class="tree-node tree-hotstring ${hsError}" data-line="${hs.line}">`;
            html += `📝 :${hs.options}:${hs.trigger}::`;
            html += `</div>`;
        }
    }

    // Empty state
    if (structure.classes.length === 0 && structure.functions.length === 0 &&
        structure.hotkeys.length === 0 && structure.hotstrings.length === 0) {
        html = '<div class="structure-empty">No structure detected (simple script)</div>';
    }

    html += '</div>';
    container.innerHTML = html;

    // Add click handlers to navigate to lines
    container.querySelectorAll('.tree-node[data-line]').forEach(node => {
        node.addEventListener('click', () => {
            const line = parseInt(node.dataset.line, 10);
            if (state.editor && line) {
                state.editor.revealLineInCenter(line);
                state.editor.setPosition({ lineNumber: line, column: 1 });
                state.editor.focus();
            }
        });
    });
}

function hasProblemsNearLine(targetLine, problemLines, range) {
    for (let i = targetLine - range; i <= targetLine + range; i++) {
        const problems = problemLines.get(i);
        if (problems && problems.length > 0) {
            const hasError = problems.some(p => p.severity === 1);
            return hasError ? 'tree-error' : 'tree-warning';
        }
    }
    return '';
}

// Edit mode
function enterEditMode() {
    if (!state.currentScript || !state.editor) return;

    state.isEditing = true;
    state.editor.updateOptions({ readOnly: false });
    state.editor.focus();
    elements.btnSave.classList.remove('hidden');
    elements.btnCancelEdit.classList.remove('hidden');
    elements.btnEdit.classList.add('hidden');
}

function exitEditMode() {
    state.isEditing = false;
    if (state.editor) {
        state.editor.updateOptions({ readOnly: true });
        // Restore original content if canceling
        if (state.currentScript) {
            state.editor.setValue(state.currentScript.content);
        }
    }
    elements.btnSave.classList.add('hidden');
    elements.btnCancelEdit.classList.add('hidden');
    elements.btnEdit.classList.remove('hidden');
}

async function saveScript() {
    if (!state.currentScript || !state.isEditing || !state.editor) return;

    const content = state.editor.getValue();

    showLoading('Saving...');

    try {
        await api(`/script-content/${encodeURIComponent(state.currentScript.id)}`, {
            method: 'PUT',
            body: JSON.stringify({ content })
        });

        state.currentScript.content = content;

        state.isEditing = false;
        state.editor.updateOptions({ readOnly: true });
        elements.btnSave.classList.add('hidden');
        elements.btnCancelEdit.classList.add('hidden');
        elements.btnEdit.classList.remove('hidden');

        toast('Script saved');

    } catch (error) {
        toast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Review status
async function setStatus(status) {
    if (!state.currentScript) return;

    try {
        await api(`/script-status/${encodeURIComponent(state.currentScript.id)}`, {
            method: 'POST',
            body: JSON.stringify({ status })
        });

        state.currentScript.status = status;

        // Update in filtered list
        const scriptInList = state.filteredScripts[state.currentIndex];
        if (scriptInList) {
            scriptInList.status = status;
        }

        // Update UI
        elements.scriptStatus.textContent = status;
        elements.scriptStatus.className = `badge badge-${status}`;
        renderScriptList();
        loadStats();

        toast(`Marked as ${status}`);

        // In review mode, auto-advance
        if (state.isReviewMode) {
            setTimeout(() => nextScript(), 300);
        }

    } catch (error) {
        toast(error.message, 'error');
    }
}

// Run script with local AHK
async function runCurrentScript() {
    if (!state.currentScript) return;

    showLoading('Running script...');

    try {
        const result = await api(`/script-run/${encodeURIComponent(state.currentScript.id)}`, {
            method: 'POST'
        });

        if (result.success) {
            toast(`Script running (PID: ${result.pid})`, 'success');
        } else {
            toast(result.message || 'Failed to run script', 'error');
        }

    } catch (error) {
        toast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Lint
async function lintCurrentScript() {
    if (!state.currentScript) return;

    showLoading('Linting...');

    try {
        const result = await api(`/script-lint/${encodeURIComponent(state.currentScript.id)}`, {
            method: 'POST'
        });

        state.currentScript.lint_results = result.diagnostics;
        state.currentScript.errors = result.errors;
        state.currentScript.warnings = result.warnings;

        // Update quality badge
        let quality = 'good';
        if (result.errors > 0) quality = 'error';
        else if (result.warnings > 0) quality = 'warning';

        state.currentScript.quality = quality;
        elements.scriptQuality.textContent = quality;
        elements.scriptQuality.className = `badge badge-${quality}`;

        // Update in list
        const scriptInList = state.filteredScripts[state.currentIndex];
        if (scriptInList) {
            scriptInList.quality = quality;
            scriptInList.errors = result.errors;
            scriptInList.warnings = result.warnings;
        }

        renderScriptList();

        if (result.diagnostics && result.diagnostics.length > 0) {
            showProblemsPanel(result.diagnostics);
            toast(`Found ${result.errors} error(s), ${result.warnings} warning(s)`, 'warning');
        } else {
            showProblemsPanel([]);
            toast('No issues found', 'success');
        }

    } catch (error) {
        toast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Fix with AI
async function fixCurrentScript() {
    if (!state.currentScript) return;

    const level = elements.fixLevel.value;
    showLoading(`Running AI fix (${level})...`);

    try {
        const result = await api(`/script-fix/${encodeURIComponent(state.currentScript.id)}`, {
            method: 'POST',
            body: JSON.stringify({ level })
        });

        state.fixResult = result;

        if (!result.success) {
            toast(result.error || 'Fix failed', 'error');
            return;
        }

        if (!result.changed) {
            toast('No changes needed', 'success');
            return;
        }

        // Show diff
        elements.scriptViewer.classList.add('hidden');
        elements.diffViewer.classList.remove('hidden');

        if (state.diffOriginalEditor) {
            state.diffOriginalEditor.setValue(result.original);
        }
        if (state.diffFixedEditor) {
            state.diffFixedEditor.setValue(result.fixed);
        }

        toast('Fix complete - review changes', 'success');

    } catch (error) {
        toast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

function acceptFix() {
    if (!state.fixResult || !state.fixResult.changed) return;

    // Update current script content
    state.currentScript.content = state.fixResult.fixed;

    // Update Monaco editor
    if (state.editor) {
        state.editor.setValue(state.fixResult.fixed);
    }

    // Hide diff, show viewer
    elements.diffViewer.classList.add('hidden');
    elements.scriptViewer.classList.remove('hidden');

    state.fixResult = null;
    toast('Fix accepted');
}

async function rejectFix() {
    if (!state.fixResult) return;

    // Restore original content if we have backup
    if (state.fixResult.backup) {
        try {
            await api(`/script-content/${encodeURIComponent(state.currentScript.id)}`, {
                method: 'PUT',
                body: JSON.stringify({ content: state.fixResult.original })
            });
        } catch (error) {
            console.error('Failed to restore:', error);
        }
    }

    // Hide diff, show viewer
    elements.diffViewer.classList.add('hidden');
    elements.scriptViewer.classList.remove('hidden');

    state.fixResult = null;
    toast('Fix rejected');
}

// Review mode
function enterReviewMode() {
    state.isReviewMode = true;
    elements.reviewModeOverlay.classList.remove('hidden');

    if (state.currentIndex < 0 && state.filteredScripts.length > 0) {
        selectScript(0);
    }

    updateReviewProgress();
}

function exitReviewMode() {
    state.isReviewMode = false;
    elements.reviewModeOverlay.classList.add('hidden');
}

function updateReviewProgress() {
    const current = state.currentIndex + 1;
    const total = state.filteredScripts.length;
    elements.reviewModeProgress.textContent = `${current} / ${total}`;
}

function nextScript() {
    if (state.currentIndex < state.filteredScripts.length - 1) {
        selectScript(state.currentIndex + 1);
    }
}

function prevScript() {
    if (state.currentIndex > 0) {
        selectScript(state.currentIndex - 1);
    }
}

// Keyboard shortcuts (only when not in Monaco editor)
document.addEventListener('keydown', (e) => {
    // Check if focus is inside Monaco editor
    const isInMonaco = document.activeElement?.closest('.monaco-editor');

    // Ctrl+R to run script (works everywhere)
    if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault();
        runCurrentScript();
        return;
    }

    // Allow Escape to work even in Monaco
    if (e.key === 'Escape') {
        if (state.isEditing) {
            exitEditMode();
            e.preventDefault();
        } else if (state.isReviewMode) {
            exitReviewMode();
            e.preventDefault();
        } else if (!elements.diffViewer.classList.contains('hidden')) {
            rejectFix();
            e.preventDefault();
        }
        return;
    }

    // Ignore other shortcuts if in Monaco or input elements
    if (isInMonaco || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
    }

    // Global shortcuts
    switch (e.key) {
        case 'r':
        case 'R':
            e.preventDefault();
            if (state.isReviewMode) {
                exitReviewMode();
            } else {
                enterReviewMode();
            }
            break;

        case 'e':
        case 'E':
            if (!state.isEditing) {
                e.preventDefault();
                enterEditMode();
            }
            break;

        case 'l':
        case 'L':
            e.preventDefault();
            lintCurrentScript();
            break;

        case 'f':
        case 'F':
            e.preventDefault();
            fixCurrentScript();
            break;

        case '1':
            e.preventDefault();
            setStatus('approved');
            break;

        case '2':
            e.preventDefault();
            setStatus('needs_fix');
            break;

        case '3':
            e.preventDefault();
            setStatus('rejected');
            break;

        case '4':
            e.preventDefault();
            setStatus('reviewed_ok');
            break;

        case '5':
            e.preventDefault();
            setStatus('skip');
            break;

        case 'ArrowDown':
        case 'j':
            e.preventDefault();
            nextScript();
            break;

        case 'ArrowUp':
        case 'k':
            e.preventDefault();
            prevScript();
            break;
    }
});

// Event listeners
elements.btnReviewMode.addEventListener('click', () => {
    if (state.isReviewMode) {
        exitReviewMode();
    } else {
        enterReviewMode();
    }
});

elements.btnExitReview.addEventListener('click', exitReviewMode);
elements.btnRefresh.addEventListener('click', async () => {
    showLoading('Refreshing...');
    await Promise.all([loadScripts(), loadCategories(), loadStats()]);
    hideLoading();
    toast('Refreshed');
});

elements.filterCategory.addEventListener('change', loadScripts);
elements.filterStatus.addEventListener('change', loadScripts);
elements.filterQuality.addEventListener('change', loadScripts);

elements.btnRun.addEventListener('click', runCurrentScript);
elements.btnEdit.addEventListener('click', enterEditMode);
elements.btnSave.addEventListener('click', saveScript);
elements.btnCancelEdit.addEventListener('click', exitEditMode);
elements.btnLint.addEventListener('click', lintCurrentScript);
elements.btnFix.addEventListener('click', fixCurrentScript);

elements.btnAcceptFix.addEventListener('click', acceptFix);
elements.btnRejectFix.addEventListener('click', rejectFix);

// Problems panel toggle
if (elements.btnToggleProblems) {
    elements.btnToggleProblems.addEventListener('click', toggleProblemsPanel);
}

// Tab switching
document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

// Structure analyze button
const btnAnalyzeStructure = document.getElementById('btn-analyze-structure');
if (btnAnalyzeStructure) {
    btnAnalyzeStructure.addEventListener('click', analyzeStructure);
}

// Status buttons
document.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        setStatus(btn.dataset.status);
    });
});

// Initialize
async function init() {
    showLoading('Loading Monaco Editor...');

    try {
        await setupMonaco();
        initPanelResize();

        showLoading('Loading scripts...');

        await Promise.all([
            loadCategories(),
            loadStats()
        ]);
        await loadScripts();

        // Select first script if available
        if (state.filteredScripts.length > 0) {
            await selectScript(0);
        }

    } catch (error) {
        toast('Failed to load: ' + error.message, 'error');
        console.error(error);
    } finally {
        hideLoading();
    }
}

init();
