// ============================================================
// 1. GLOBAL STATE & CONFIG
// ============================================================
const API_BASE = '/api';
const COMPETENCIES = ['Statistical', 'Data Analysis', 'Data Visualization', 'Digital Governance', 'Leadership'];
const POSSIBLE_TARGETS = [
    'Senior Statistical Officer',
    'Deputy Director (Statistics)',
    'Joint Director (Statistics)',
    'Adviser (Statistics)',
    'Statistical Officer'
];

let state = {
    token: localStorage.getItem('token') || null,
    user: null,
    isLoggedIn: false,
    currentPage: 'dashboard',
    currentRole: 'learner', // 'learner' | 'admin'
    selectedTargetRole: 'Senior Statistical Officer',
    chatHistory: [],
    assessmentFile: null,
    currentAssessmentId: null,
    assessmentQuestions: [],
    assessmentAnswers: {},
    assessmentSubmitted: false,
    assessmentScore: null,
    notificationsVisible: false,
};

let radarChartInstance = null;

// ============================================================
// 2. API UTILITY HELPER
// ============================================================
async function fetchAPI(endpoint, options = {}) {
    const headers = {};
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }
    if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }

    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: { ...headers, ...(options.headers || {}) }
        });

        if (response.status === 401) {
            handleLogout();
            throw new Error('Unauthorized or session expired.');
        }

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.detail || `Request failed with status ${response.status}`);
        }

        return await response.json();
    } catch (err) {
        console.error(`API Error on ${endpoint}:`, err);
        throw err;
    }
}

// ============================================================
// 3. AUTHENTICATION & SESSION
// ============================================================
async function handleLogin(e) {
    if (e) e.preventDefault();
    const employeeId = document.getElementById('employeeIdInput').value.trim() || 'MOSPI-2024-0142';
    const password = document.getElementById('passwordInput').value.trim() || 'password';

    const formData = new URLSearchParams();
    formData.append('username', employeeId);
    formData.append('password', password);

    try {
        const tokenData = await fetchAPI('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
        });

        state.token = tokenData.access_token;
        localStorage.setItem('token', state.token);

        state.user = await fetchAPI('/auth/me');
        state.isLoggedIn = true;

        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appContainer').style.display = 'flex';

        document.getElementById('userNameDisplay').textContent = state.user.name;
        document.getElementById('userRoleDisplay').textContent = state.user.designation;
        document.getElementById('userAvatar').textContent = state.user.initials;
        document.getElementById('sidebarUser').textContent = `${state.user.initials} Â· ${state.user.name}`;

        state.currentRole = state.user.is_admin ? 'admin' : 'learner';
        document.getElementById('roleLabel').textContent = state.currentRole === 'learner' ? '(Learner)' : '(Admin)';

        buildSidebar();
        navigateTo(state.user.is_admin ? 'admin' : 'dashboard');
    } catch (err) {
        alert(err.message || 'Invalid Employee ID or Password');
    }
}

function handleLogout() {
    state.token = null;
    state.user = null;
    state.isLoggedIn = false;
    state.chatHistory = [];
    localStorage.removeItem('token');

    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('notifPanel').style.display = 'none';
    document.getElementById('sidebar')?.classList.remove('open');
}

function switchRole() {
    state.currentRole = state.currentRole === 'learner' ? 'admin' : 'learner';
    document.getElementById('roleLabel').textContent = state.currentRole === 'learner' ? '(Learner)' : '(Admin)';
    buildSidebar();
    navigateTo(state.currentRole === 'admin' ? 'admin' : 'dashboard');
}

// ============================================================
// 4. GAP UTILITY & FORMATTERS
// ============================================================
function getGapSeverity(gap) {
    if (gap <= 0) return { label: 'No Gap', badge: 'badge-success', icon: 'âœ…' };
    if (gap === 1) return { label: 'Low Gap', badge: 'badge-warning', icon: 'âš ï¸' };
    return { label: 'High Gap', badge: 'badge-danger', icon: 'âŒ' };
}

// ============================================================
// 5. PAGE ROUTER & RENDERING
// ============================================================
async function renderPage(page) {
    const main = document.getElementById('mainContent');
    main.innerHTML = '<div style="padding: 2rem; color: #64748b;"><i class="fas fa-spinner fa-spin"></i> Fetching data from server...</div>';

    try {
        switch (page) {
            case 'dashboard': await renderDashboard(main); break;
            case 'profile': await renderProfile(main); break;
            case 'skillgaps': await renderSkillGaps(main); break;
            case 'learning': await renderLearning(main); break;
            case 'career': await renderCareer(main); break;
            case 'assistant': renderAssistant(main); break;
            case 'assessment': renderAssessment(main); break;
            case 'admin': await renderAdmin(main); break;
            default: await renderDashboard(main);
        }
    } catch (err) {
        main.innerHTML = `<div class="card"><p style="color:#ef4444;"><i class="fas fa-exclamation-circle"></i> Error loading page: ${err.message}</p></div>`;
    }

    document.querySelectorAll('.sidebar-nav a').forEach(a => {
        a.classList.toggle('active', a.dataset.page === page);
    });
}

// ----- DASHBOARD -----
async function renderDashboard(container) {
    const gapData = await fetchAPI(
        `/gaps?target_role=${encodeURIComponent(state.selectedTargetRole)}`
    );

    const recommended = await fetchAPI(
        `/courses/recommended?target_role=${encodeURIComponent(state.selectedTargetRole)}`
    );

    let totalGaps = 0;
    let highGaps = 0;

    COMPETENCIES.forEach(comp => {
        const g = gapData.gaps[comp]?.gap || 0;

        if (g > 0) {
            totalGaps++;

            if (g >= 2) {
                highGaps++;
            }
        }
    });

    const progress = Math.round(COMPETENCIES.reduce((sum, comp) => { const item = gapData.gaps[comp]; if (!item || !item.required) return sum; return sum + Math.min(item.current / item.required, 1) * 100; }, 0) / COMPETENCIES.length);

    const readinessClass =
        progress > 70
            ? 'success'
            : progress > 40
                ? 'warning'
                : 'danger';

    container.innerHTML = `
        <div class="page dashboard-page">

            <!-- HERO -->
            <section class="dashboard-hero">

                <div class="dashboard-hero-content">

                    <div class="hero-eyebrow">
                        <i class="fas fa-sparkles"></i>
                        YOUR COMPETENCY JOURNEY
                    </div>

                    <h1>
                        Welcome back,
                        <span>${state.user.name}</span> 👋
                    </h1>

                    <p class="hero-description">
                        Continue building the skills you need for your
                        target role and stay future-ready.
                    </p>

                    <div class="target-role-highlight">

                        <div class="target-role-icon">
                            <i class="fas fa-briefcase"></i>
                        </div>

                        <div>
                            <span class="target-role-label">
                                TARGET ROLE
                            </span>

                            <strong>
                                ${state.selectedTargetRole}
                            </strong>

                            <small>
                                Your competency profile is evaluated
                                against this role
                            </small>
                        </div>

                    </div>

                </div>

                <div class="hero-decoration">
                    <i class="fas fa-chart-line"></i>
                </div>

            </section>


            <!-- KPI CARDS -->
            <div class="card-grid dashboard-stats">

                <div class="stat-card dashboard-stat competencies-stat">

                    <div class="stat-top">
                        <div class="stat-icon">
                            <i class="fas fa-clipboard-check"></i>
                        </div>

                        <span class="stat-status status-blue">
                            ASSESSED
                        </span>
                    </div>

                    <div class="stat-label">
                        COMPETENCIES ASSESSED
                    </div>

                    <div class="stat-value">
                        ${COMPETENCIES.length}
                    </div>

                    <div class="stat-sub">
                        Across official MoSPI competency domains
                    </div>

                </div>


                <div class="stat-card dashboard-stat critical-stat">

                    <div class="stat-top">
                        <div class="stat-icon">
                            <i class="fas fa-triangle-exclamation"></i>
                        </div>

                        <span class="stat-status status-red">
                            PRIORITY
                        </span>
                    </div>

                    <div class="stat-label">
                        CRITICAL GAPS
                    </div>

                    <div class="stat-value">
                        ${highGaps}
                    </div>

                    <div class="stat-sub">
                        ${
                            highGaps > 0
                                ? 'Requires focused training'
                                : 'No critical gaps identified'
                        }
                    </div>

                </div>


                <div class="stat-card dashboard-stat courses-stat">

                    <div class="stat-top">
                        <div class="stat-icon">
                            <i class="fas fa-graduation-cap"></i>
                        </div>

                        <span class="stat-status status-green">
                            PERSONALIZED
                        </span>
                    </div>

                    <div class="stat-label">
                        COURSES RECOMMENDED
                    </div>

                    <div class="stat-value">
                        ${recommended.length}
                    </div>

                    <div class="stat-sub">
                        Selected based on your competency gaps
                    </div>

                </div>


                <div class="stat-card dashboard-stat readiness-stat">

                    <div class="stat-top">
                        <div class="stat-icon">
                            <i class="fas fa-bullseye"></i>
                        </div>

                        <span class="stat-status status-purple">
                            TARGET ROLE
                        </span>
                    </div>

                    <div class="stat-label">
                        ROLE READINESS
                    </div>

                    <div class="stat-value">
                        ${Math.round(progress)}%
                    </div>

                    <div class="readiness-progress">
                        <div
                            class="readiness-fill ${readinessClass}"
                            style="width:${progress}%"
                        ></div>
                    </div>

                    <div class="readiness-footer">
                        <span>
                            ${
                                progress >= 70
                                    ? 'Strong progress'
                                    : progress >= 40
                                        ? 'Keep building skills'
                                        : 'Focus on critical gaps'
                            }
                        </span>

                        <strong>
                            ${Math.round(progress)}%
                        </strong>
                    </div>

                </div>

            </div>


            <!-- COMPETENCY PROFILE -->
            <div class="card competency-profile-card">

                <div class="competency-header">

                    <div class="competency-title">

                        <div class="section-icon">
                            <i class="fas fa-chart-radar"></i>
                        </div>

                        <div>
                            <h3>Live Competency Profile</h3>

                            <p>
                                Your current skills compared with
                                the requirements of your target role
                            </p>
                        </div>

                    </div>

                    <div class="competency-legend">

                        <span>
                            <i class="legend-required"></i>
                            Required Level
                        </span>

                        <span>
                            <i class="legend-current"></i>
                            Current Level
                        </span>

                    </div>

                </div>


                <div class="competency-content">

                    <div class="chart-wrapper">
                        <canvas id="radarChart"></canvas>
                    </div>

                    <div class="competency-insight">

                        <div class="insight-icon">
                            <i class="fas fa-lightbulb"></i>
                        </div>

                        <div>
                            <h4>Focus on your priority gaps</h4>

                            <p>
                                Closing your critical competency gaps
                                will directly improve readiness for
                                <strong>${state.selectedTargetRole}</strong>.
                            </p>

                            <button
                                class="btn btn-primary insight-btn"
                                onclick="navigateTo('skillgaps')"
                            >
                                View Skill Gaps
                                <i class="fas fa-arrow-right"></i>
                            </button>

                        </div>

                    </div>

                </div>

            </div>

        </div>
    `;

    setTimeout(() => initRadarChart(gapData.gaps), 50);
}

function initRadarChart(gaps) {
    const canvas = document.getElementById('radarChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (radarChartInstance) {
        radarChartInstance.destroy();
        radarChartInstance = null;
    }

    const labels = COMPETENCIES;
    const requiredData = labels.map(c => gaps[c] ? gaps[c].required : 0);
    const currentData = labels.map(c => gaps[c] ? gaps[c].current : 0);

    radarChartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Required Level',
                data: requiredData,
                backgroundColor: 'rgba(37, 99, 235, 0.15)',
                borderColor: '#2563eb',
                borderWidth: 2,
                pointBackgroundColor: '#2563eb',
            }, {
                label: 'Current Level',
                data: currentData,
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                borderColor: '#ef4444',
                borderWidth: 2,
                pointBackgroundColor: '#ef4444',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true,
                    max: 7,
                    ticks: { stepSize: 1 }
                }
            },
            plugins: {
                legend: { position: 'top' }
            }
        }
    });
}

// ----- PROFILE -----
async function renderProfile(container) {
    const user = state.user;
    const gapData = await fetchAPI(`/gaps?target_role=${encodeURIComponent(state.selectedTargetRole)}`);

    let highGaps = 0;
    let lowGaps = 0;
    let noGaps = 0;
    let totalReadiness = 0;

    COMPETENCIES.forEach(c => {
        const g = gapData.gaps[c] || { current: 0, required: 0, gap: 0 };

        if (g.gap >= 2) highGaps++;
        else if (g.gap === 1) lowGaps++;
        else noGaps++;

        if (g.required > 0) {
            totalReadiness += Math.min(g.current / g.required, 1) * 100;
        }
    });

    const readiness = Math.round(
        totalReadiness / Math.max(COMPETENCIES.length, 1)
    );

    container.innerHTML = `
        <div class="page profile-page">

            <div class="page-header profile-page-header">
                <div>
                    <h2>
                        <i class="fas fa-user-circle"></i>
                        Official Profile
                    </h2>
                    <p>Your professional details, competency levels, and target career information.</p>
                </div>

                <div class="profile-quote">
                    <i class="fas fa-quote-left"></i>
                    <span>Continuous learning builds stronger public institutions.</span>
                    <small>iGOT Karmayogi</small>
                </div>
            </div>

            <!-- PROFILE HERO -->
            <div class="profile-hero card">

                <div class="profile-identity">

                    <div class="profile-avatar-wrap">
                        <div class="profile-avatar">
                            ${user.initials}
                        </div>
                        <span class="profile-online"></span>
                    </div>

                    <div class="profile-details">

                        <div class="profile-name-row">
                            <h3>${user.name}</h3>
                            <span class="profile-role-badge">
                                ${user.designation}
                            </span>
                        </div>

                        <p class="profile-department">
                            ${user.department}
                        </p>

                        <div class="profile-meta">
                            <span>
                                <i class="fas fa-id-badge"></i>
                                ${user.employeeId}
                            </span>

                            <span>
                                <i class="fas fa-envelope"></i>
                                ${user.email}
                            </span>

                            <span>
                                <i class="fas fa-graduation-cap"></i>
                                ${user.qualification}
                            </span>
                        </div>

                        <div class="profile-target">
                            <i class="fas fa-bullseye"></i>
                            <strong>Target Role:</strong>
                            <span>${state.selectedTargetRole}</span>
                        </div>

                    </div>
                </div>

                <div class="profile-hero-side">
                    <div class="profile-motivation">
                        <i class="fas fa-chart-column"></i>
                        <p>Skilled people,<br>stronger data,<br>a brighter Bharat.</p>
                        <span></span>
                    </div>
                </div>

            </div>

            <!-- MAIN PROFILE GRID -->
            <div class="profile-content-grid">

                <!-- COMPETENCY MATRIX -->
                <div class="card profile-competency-card">

                    <div class="section-heading">
                        <div>
                            <h3>
                                <i class="fas fa-chart-column"></i>
                                Competency Assessment Matrix
                            </h3>
                            <p>
                                Your current competency levels compared with the
                                requirements for your target role.
                            </p>
                        </div>

                        <div class="gap-legend">
                            <span>
                                <b class="legend-dot no-gap"></b>
                                No Gap
                            </span>
                            <span>
                                <b class="legend-dot low-gap"></b>
                                Low Gap
                            </span>
                            <span>
                                <b class="legend-dot high-gap"></b>
                                High Gap
                            </span>
                        </div>
                    </div>

                    <div class="competency-table">

                        <div class="competency-row competency-header">
                            <span>COMPETENCY</span>
                            <span>CURRENT</span>
                            <span>REQUIRED</span>
                            <span>PROGRESS</span>
                            <span>GAP</span>
                            <span>PRIORITY</span>
                        </div>

                        ${COMPETENCIES.map(c => {
                            const g = gapData.gaps[c] || {
                                current: 0,
                                required: 0,
                                gap: 0
                            };

                            const sev = getGapSeverity(g.gap);

                            const percentage = g.required > 0
                                ? Math.round(Math.min(g.current / g.required, 1) * 100)
                                : 0;

                            const progressClass =
                                g.gap >= 2
                                    ? 'progress-danger'
                                    : g.gap === 1
                                        ? 'progress-warning'
                                        : 'progress-success';

                            return `
                                <div class="competency-row">

                                    <span class="competency-name">
                                        <i class="fas fa-chart-simple"></i>
                                        ${c}
                                    </span>

                                    <strong class="current-level">
                                        ${g.current}
                                    </strong>

                                    <strong class="required-level">
                                        ${g.required}
                                    </strong>

                                    <span class="competency-progress">
                                        <span class="progress-track">
                                            <span
                                                class="progress-fill ${progressClass}"
                                                style="width:${percentage}%"
                                            ></span>
                                        </span>
                                        <small>${percentage}%</small>
                                    </span>

                                    <strong class="gap-number ${g.gap >= 2 ? 'gap-high' : g.gap === 1 ? 'gap-low' : 'gap-none'}">
                                        ${g.gap}
                                    </strong>

                                    <span class="badge ${sev.badge}">
                                        ${sev.label}
                                    </span>

                                </div>
                            `;
                        }).join('')}

                    </div>
                </div>

                <!-- RIGHT SIDEBAR -->
                <div class="profile-side-column">

                    <!-- SUMMARY -->
                    <div class="card profile-summary-card">

                        <div class="side-card-title">
                            <i class="fas fa-file-lines"></i>
                            <h3>Profile Summary</h3>
                        </div>

                        <div class="summary-grid">

                            <div class="summary-item summary-blue">
                                <i class="fas fa-layer-group"></i>
                                <div>
                                    <strong>${COMPETENCIES.length}</strong>
                                    <span>Competencies</span>
                                </div>
                            </div>

                            <div class="summary-item summary-red">
                                <i class="fas fa-triangle-exclamation"></i>
                                <div>
                                    <strong>${highGaps}</strong>
                                    <span>High Priority</span>
                                </div>
                            </div>

                            <div class="summary-item summary-yellow">
                                <i class="fas fa-exclamation"></i>
                                <div>
                                    <strong>${lowGaps}</strong>
                                    <span>Low Priority</span>
                                </div>
                            </div>

                            <div class="summary-item summary-green">
                                <i class="fas fa-circle-notch"></i>
                                <div>
                                    <strong>${readiness}%</strong>
                                    <span>Readiness</span>
                                </div>
                            </div>

                        </div>

                    </div>

                    <!-- QUICK ACTIONS -->
                    <div class="card profile-actions-card">

                        <div class="side-card-title">
                            <i class="fas fa-bolt"></i>
                            <h3>Quick Actions</h3>
                        </div>

                        <button class="profile-action primary" onclick="navigateTo('learning')">
                            <i class="fas fa-book-open"></i>
                            View Learning Recommendations
                        </button>

                        <button class="profile-action" onclick="navigateTo('career')">
                            <i class="fas fa-road"></i>
                            Explore Career Pathway
                        </button>

                        <button class="profile-action" onclick="navigateTo('assessment')">
                            <i class="fas fa-file-circle-check"></i>
                            Generate New Assessment
                        </button>

                    </div>

                </div>

            </div>

        </div>
    `;
}// ----- SKILL GAPS -----
async function renderSkillGaps(container) {
    const gapData = await fetchAPI(`/gaps?target_role=${encodeURIComponent(state.selectedTargetRole)}`);

    container.innerHTML = `
        <div class="page">
            <div class="page-header">
                <h2><i class="fas fa-exclamation-triangle"></i> Competency Skill Gaps</h2>
                <p>Calculated by backend rules engine: <strong>Required Level âˆ’ Current Level</strong></p>
            </div>
            <div class="card">
                <div class="table-responsive">
                    <table>
                        <thead>
                            <tr>
                                <th>Competency</th>
                                <th>Required Level</th>
                                <th>Current Level</th>
                                <th>Gap</th>
                                <th>Priority</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${COMPETENCIES.map(c => {
                                const g = gapData.gaps[c] || { required: 0, current: 0, gap: 0 };
                                const sev = getGapSeverity(g.gap);
                                return `<tr>
                                    <td><strong>${c}</strong></td>
                                    <td>${g.required}</td>
                                    <td>${g.current}</td>
                                    <td>${g.gap}</td>
                                    <td><span class="badge ${sev.badge}">${sev.icon} ${sev.label}</span></td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// ----- LEARNING -----
async function renderLearning(container) {
    const recommended = await fetchAPI(`/courses/recommended?target_role=${encodeURIComponent(state.selectedTargetRole)}`);

    container.innerHTML = `
        <div class="page">
            <div class="page-header">
                <h2><i class="fas fa-graduation-cap"></i> Recommended Training Modules</h2>
                <p>Courses mapped dynamically against your detected competency deficiencies.</p>
            </div>
            ${recommended.length === 0 ? '<div class="card"><p>No training required. You meet all competency thresholds for this target role!</p></div>' : `
            <div class="course-grid">
                ${recommended.map(c => `
                    <div class="course-card">
                        <h4>${c.title}</h4>
                        <div class="course-skill"><i class="fas fa-tag"></i> ${c.skill}</div>
                        <div class="course-reason">${c.reason}</div>
                        <div class="course-priority">
                            <span class="badge ${c.severity === 'High' ? 'badge-danger' : 'badge-warning'}">
                                Priority: ${c.severity} (Gap ${c.gap})
                            </span>
                        </div>
                        <div class="course-actions">
                            <button class="btn btn-sm btn-primary" onclick="viewCourse('${c.id}', '${c.title}', '${c.skill}', '${c.description.replace(/'/g, "\\'")}')">View Details</button>
                            <button class="btn btn-sm btn-outline" onclick="showExplainability('${c.title}', '${c.skill}', ${c.gap})">Why Recommended?</button>
                        </div>
                    </div>
                `).join('')}
            </div>`}
        </div>
    `;
}

// ----- CAREER NAVIGATOR -----
async function renderCareer(container) {
    const gapData = await fetchAPI(
        `/gaps?target_role=${encodeURIComponent(state.selectedTargetRole)}`
    );

    const recommended = await fetchAPI(
        `/courses/recommended?target_role=${encodeURIComponent(state.selectedTargetRole)}`
    );

    const gapItems = COMPETENCIES.map(c => {
        const g = gapData.gaps[c] || {
            current: 0,
            required: 0,
            gap: 0
        };

        if (g.gap <= 0) return '';

        const severity = g.gap === 1 ? 'low' : 'high';
        const label = g.gap === 1 ? 'Low Gap' : 'High Gap';
        const icon = g.gap === 1
            ? 'fa-triangle-exclamation'
            : 'fa-circle-exclamation';

        const competencyIcon =
            c === 'Statistical'
                ? 'fa-chart-column'
                : c === 'Data Analysis'
                    ? 'fa-database'
                    : c === 'Data Visualization'
                        ? 'fa-chart-line'
                        : c === 'Digital Governance'
                            ? 'fa-shield-halved'
                            : 'fa-users';

        return `
            <div class="career-gap-item ${severity}">

                <div class="career-gap-icon">
                    <i class="fas ${competencyIcon}"></i>
                </div>

                <div class="career-gap-name">
                    <strong>${c}</strong>
                    <span>Gap of ${g.gap} level(s)</span>
                </div>

                <div class="career-gap-status ${severity}">
                    <i class="fas ${icon}"></i>
                    ${label}
                </div>

            </div>
        `;
    }).join('');

    const roadmapSteps = recommended.map((course, i) => `
        <div class="career-roadmap-item">

            <div class="career-step-number">
                ${i + 1}
            </div>

            <div class="career-roadmap-content">

                <div>
                    <strong>
                        Complete "${course.title}"
                    </strong>

                    <span>
                        To close ${course.skill} gap.
                    </span>
                </div>

                <div class="career-address-badge">
                    Addresses Gap
                </div>

            </div>

        </div>
    `).join('');

    const reassessmentStep = `
        <div class="career-roadmap-item">

            <div class="career-step-number">
                ${recommended.length + 1}
            </div>

            <div class="career-roadmap-content">

                <div>
                    <strong>
                        Undergo Competency Reassessment
                    </strong>

                    <span>
                        Measure progress and update your competency profile.
                    </span>
                </div>

                <div class="career-address-badge reassessment">
                    Reassess
                </div>

            </div>

        </div>
    `;

    container.innerHTML = `
        <div class="page career-page">

            <!-- PAGE HEADER -->
            <div class="career-page-header">

                <div>
                    <div class="career-eyebrow">
                        <i class="fas fa-route"></i>
                        CAREER DEVELOPMENT
                    </div>

                    <h2>
                        <i class="fas fa-road"></i>
                        Career Pathway Navigator
                    </h2>

                    <p>
                        Select your target civil service role to project
                        prerequisites and career steps.
                    </p>
                </div>

                <div class="career-growth-banner">

                    <div class="career-growth-icon">
                        <i class="fas fa-bullseye"></i>
                    </div>

                    <div>
                        <strong>Plan your growth</strong>
                        <span>
                            Identify skill gaps, follow a structured
                            learning path, and move towards your target role.
                        </span>
                    </div>

                </div>

            </div>


            <!-- TARGET ROLE -->
            <div class="career-target-card">

                <div class="career-target-left">

                    <label>
                        Select Target Cadre Position
                    </label>

                    <select id="targetRoleSelect">
                        ${POSSIBLE_TARGETS.map(r =>
                            `<option value="${r}" ${r === state.selectedTargetRole ? 'selected' : ''}>${r}</option>`
                        ).join('')}

                    </select>

                </div>

                <div class="career-role-flow">

                    <div class="career-role-box">
                        <i class="fas fa-user-tie"></i>

                        <div>
                            <span>Current Role</span>
                            <strong>Statistical Officer</strong>
                        </div>
                    </div>

                    <i class="fas fa-arrow-right career-role-arrow"></i>

                    <div class="career-role-box target">

                        <i class="fas fa-bullseye"></i>

                        <div>
                            <span>Target Role</span>
                            <strong>${state.selectedTargetRole}</strong>
                        </div>

                    </div>

                    <div class="career-next-level">
                        <i class="fas fa-chart-line"></i>

                        <div>
                            <span>Career Growth</span>
                            <strong>Next Level</strong>
                        </div>
                    </div>

                </div>

            </div>


            <!-- MAIN TWO COLUMN AREA -->
            <div class="career-two-column">

                <!-- IDENTIFIED GAPS -->
                <div class="card career-panel">

                    <div class="career-panel-header">

                        <div class="career-panel-icon blue">
                            <i class="fas fa-chart-column"></i>
                        </div>

                        <div>
                            <h3>Identified Gaps to Bridge</h3>

                            <p>
                                Competencies requiring improvement for
                                ${state.selectedTargetRole}
                            </p>
                        </div>

                    </div>

                    <div class="career-gap-list">

                        ${gapItems || `
                            <div class="career-no-gaps">
                                <i class="fas fa-circle-check"></i>
                                No competency gaps identified for this role.
                            </div>
                        `}

                    </div>

                </div>


                <!-- ROADMAP -->
                <div class="card career-panel">

                    <div class="career-panel-header">

                        <div class="career-panel-icon purple">
                            <i class="fas fa-file-lines"></i>
                        </div>

                        <div>
                            <h3>Prescribed Sequential Roadmap</h3>

                            <p>
                                Recommended learning path to achieve your
                                target role.
                            </p>
                        </div>

                    </div>

                    <div class="career-roadmap">

                        ${roadmapSteps}

                        ${reassessmentStep}

                    </div>

                </div>

            </div>


            <!-- CAREER TIP -->
            <div class="career-tip">

                <div class="career-tip-icon">
                    <i class="fas fa-lightbulb"></i>
                </div>

                <div>
                    <strong>Career Tip</strong>

                    <span>
                        Focus on high-gap areas first to accelerate
                        your career readiness.
                    </span>
                </div>

                <div class="career-tip-quote">
                    "Continuous learning is the bridge between your
                    current role and your ambition."
                </div>

            </div>

        </div>
    `;

    document
        .getElementById('targetRoleSelect')
        ?.addEventListener('change', function () {
            state.selectedTargetRole = this.value;
            navigateTo('career');
        });
}
function formatAIResponse(text) {
    let html = String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/^###\s+(.+)$/gm, '<h4 class="ai-heading">$1</h4>')
        .replace(/^##\s+(.+)$/gm, '<h3 class="ai-heading">$1</h3>')
        .replace(/^(\d+)\.\s+(.+)$/gm, '<div class="ai-numbered"><strong>$1.</strong> $2</div>')
        .replace(/^[-•]\s+(.+)$/gm, '<div class="ai-bullet">• $1</div>')
        .replace(/\n{2,}/g, '<div class="ai-space"></div>')
        .replace(/\n/g, '<br>');
    return html;
}
// ----- AI CHAT ASSISTANT -----
function renderAssistant(container) {
    container.innerHTML = `
        <div class="page">
            <div class="page-header">
                <h2><i class="fas fa-robot"></i> AI Competency Assistant <span style="font-size:0.7rem;background:#dbeafe;padding:0.15rem 0.7rem;border-radius:50px;color:#1e40af;font-weight:400;">RAG Grounded</span></h2>
            </div>
            <div class="chat-container" id="chatContainer">
                <div class="chat-messages" id="chatMessages">
                    ${state.chatHistory.map(msg => `
                        <div class="chat-msg ${msg.role}">
                            <div class="msg-label">${msg.role === 'user' ? 'You' : 'Gemini Assistant'}</div>
                            ${formatAIResponse(msg.text)}
                        </div>
                    `).join('')}
                    ${state.chatHistory.length === 0 ? `<div class="chat-msg assistant"><div class="msg-label">Assistant</div>Greetings ${state.user.name}. I am grounded in your competency framework and training documents. How may I assist your professional development today?</div>` : ''}
                </div>
                <div class="chat-suggestions">
                    <button data-prompt="What are my biggest skill gaps for my target role?">What are my biggest skill gaps?</button>
                    <button data-prompt="What course should I prioritize next?">What should I learn next?</button>
                    <button data-prompt="How do I qualify for Senior Statistical Officer?">Path to Senior Statistical Officer</button>
                </div>
                <div class="chat-input-area">
                    <input type="text" id="chatInput" placeholder="Ask a question about your training or career..." />
                    <button id="chatSendBtn"><i class="fas fa-paper-plane"></i> Send</button>
                </div>
            </div>
        </div>
    `;

    const msgs = document.getElementById('chatMessages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;

    document.getElementById('chatSendBtn')?.addEventListener('click', () => sendChatMessage());
    document.getElementById('chatInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatMessage(); });
    document.querySelectorAll('.chat-suggestions button').forEach(btn => {
        btn.addEventListener('click', function () {
            document.getElementById('chatInput').value = this.dataset.prompt;
            sendChatMessage();
        });
    });
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';

    state.chatHistory.push({ role: 'user', text: msg });
    renderAssistant(document.getElementById('mainContent'));

    const container = document.getElementById('chatMessages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    typingDiv.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(typingDiv);
    container.scrollTop = container.scrollHeight;

    try {
        const responseData = await fetchAPI('/ai/chat', {
            method: 'POST',
            body: JSON.stringify({
                message: msg,
                target_role: state.selectedTargetRole
            })
        });

        typingDiv.remove();
        state.chatHistory.push({ role: 'assistant', text: responseData.response });
    } catch (err) {
        typingDiv.remove();
        state.chatHistory.push({ role: 'assistant', text: "Unable to process query. Please check your backend connection or Gemini API key." });
    }

    renderAssistant(document.getElementById('mainContent'));
}

// ----- ASSESSMENT GENERATOR (RAG DOCUMENT BASED) -----
function renderAssessment(container) {
    const file = state.assessmentFile;
    const questions = state.assessmentQuestions;
    const submitted = state.assessmentSubmitted;

    container.innerHTML = `
        <div class="page">
            <div class="page-header">
                <h2><i class="fas fa-clipboard-list"></i> AI Assessment Engine</h2>
                <p>Upload official training material (PDF/DOCX/TXT). The Gemini AI engine will parse the document, index vector embeddings, and construct tailored evaluation questions.</p>
            </div>
            <div class="card">
                <div class="upload-area" id="uploadArea">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <p>Upload Training Module Material (PDF, DOCX, TXT)</p>
                    <div class="file-name" id="fileNameDisplay">${file ? file.name : 'No file selected'}</div>
                    <input type="file" id="fileInput" accept=".pdf,.doc,.docx,.txt" style="display:none;" />
                </div>
                <button id="generateAssessBtn" class="btn btn-primary" style="margin-top:0.75rem;" ${file ? '' : 'disabled'}>
                    <i class="fas fa-magic"></i> Generate Grounded Assessment
                </button>
            </div>
            ${submitted ? `
                <div class="card">
                    <h4>Assessment Score</h4>
                    <p style="font-size:1.1rem;margin:0.5rem 0;">You scored <strong>${state.assessmentScore}</strong> out of <strong>${questions.length}</strong>.</p>
                    <button class="btn btn-secondary" onclick="resetAssessment()">Take Another Assessment</button>
                </div>
            ` : (questions.length > 0 ? `
                <div class="card">
                    <h4>Generated Evaluation: ${file ? file.name : 'Document'}</h4>
                    ${questions.map((q, idx) => `
                        <div class="question-block" data-qid="${q.id}">
                            <p><strong>Q${idx + 1}:</strong> ${q.question}</p>
                            <div class="options">
                                ${q.options.map((opt, oi) => `
                                    <label><input type="radio" name="q_${q.id}" value="${oi}" ${state.assessmentAnswers[q.id] === oi ? 'checked' : ''} /> ${opt}</label>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                    <button class="btn btn-primary" id="submitAssessBtn" style="margin-top:1rem;">Submit Evaluation</button>
                </div>
            ` : '')}
        </div>
    `;

    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    if (uploadArea && fileInput) {
        uploadArea.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', function () {
            if (this.files.length > 0) {
                state.assessmentFile = this.files[0];
                state.assessmentQuestions = [];
                state.assessmentAnswers = {};
                state.assessmentSubmitted = false;
                renderAssessment(document.getElementById('mainContent'));
            }
        });
    }

    document.getElementById('generateAssessBtn')?.addEventListener('click', async function () {
        if (!state.assessmentFile) return;

        this.disabled = true;
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Parsing Document & Generating...';

        const formData = new FormData();
        formData.append('file', state.assessmentFile);

        try {
            const data = await fetchAPI('/assessments/upload', {
                method: 'POST',
                body: formData
            });

            state.currentAssessmentId = data.assessment_id;
            state.assessmentQuestions = data.questions;
            state.assessmentAnswers = {};
            state.assessmentSubmitted = false;
            renderAssessment(document.getElementById('mainContent'));
        } catch (err) {
            alert('Failed to generate assessment: ' + err.message);
            renderAssessment(document.getElementById('mainContent'));
        }
    });

    document.querySelectorAll('.question-block input[type="radio"]').forEach(el => {
        el.addEventListener('change', function () {
            const qid = this.name.replace('q_', '');
            state.assessmentAnswers[qid] = parseInt(this.value, 10);
        });
    });

    document.getElementById('submitAssessBtn')?.addEventListener('click', async function () {
        try {
            const result = await fetchAPI('/assessments/submit', {
                method: 'POST',
                body: JSON.stringify({
                    assessment_id: state.currentAssessmentId,
                    answers: state.assessmentAnswers
                })
            });

            state.assessmentScore = result.score;
            state.assessmentSubmitted = true;
            renderAssessment(document.getElementById('mainContent'));

            showAssessmentResult(result);
            document.getElementById('assessmentResultModal').style.setProperty('display','flex','important');
        } catch (err) {
            alert('Failed to submit assessment: ' + err.message);
        }
    });
}

function resetAssessment() {
    state.assessmentFile = null;
    state.assessmentQuestions = [];
    state.assessmentAnswers = {};
    state.assessmentSubmitted = false;
    state.assessmentScore = null;
    state.currentAssessmentId = null;
    renderAssessment(document.getElementById('mainContent'));
}

function showAssessmentResult(result){var pct=result.percentage??Math.round((result.score/Math.max(result.total,1))*100);var level=result.competency_level??"—";document.getElementById("assessmentResultBody").innerHTML="<p>Your performance report has been compiled successfully.</p><div class=\"assessment-result-score\"><div class=\"score-number\">"+result.score+"/"+result.total+"</div><div class=\"score-label\">"+pct+"% assessment performance</div></div><div style=\"padding:14px 16px;margin-bottom:14px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;\"><div style=\"font-size:13px;color:#64748b;margin-bottom:5px;\">Assessed Competency Level</div><div style=\"font-size:24px;font-weight:800;color:#2563eb;\">Level "+level+" / 7</div></div><div class=\"assessment-success\"><span>?</span><span>Assessment recorded and competency profile updated successfully.</span></div>";}

// ----- ADMIN DASHBOARD -----
async function renderAdmin(container) {
    const heatmap = await fetchAPI('/admin/heatmap');

    container.innerHTML = `
        <div class="page admin-page"><div class="page-header"><h2><i class="fas fa-users-cog"></i> Organization Competency Heatmap</h2>
                <p>Ministry-wide civil service competency matrix across active officials.</p>
            </div>
            <div class="card">
                <div class="table-responsive">
                    <div class="heatmap-grid">
                        <div class="header">Official</div>
                        ${COMPETENCIES.map(c => `<div class="header" style="text-align:center;">${c}</div>`).join('')}
                        ${heatmap.map(emp => `
                            <div class="header" style="font-weight:500;">${emp.name}</div>
                            ${COMPETENCIES.map(c => {
                                const val = emp.competencies ? (emp.competencies[c] || 0) : 0;
                                let cls = 'cell';
                                if (val >= 4) cls += ' high';
                                else if (val >= 3) cls += ' moderate';
                                else if (val >= 2) cls += ' low';
                                else cls += ' critical';
                                return `<div class="${cls}">${val}</div>`;
                            }).join('')}
                        `).join('')}
                    </div>
                </div>
                <div class="legend">
                    <span class="legend-item"><span class="swatch" style="background:#dcfce7;"></span> Advanced (â‰¥4)</span>
                    <span class="legend-item"><span class="swatch" style="background:#fef9c3;"></span> Proficient (3)</span>
                    <span class="legend-item"><span class="swatch" style="background:#fee2e2;"></span> Basic (2)</span>
                    <span class="legend-item"><span class="swatch" style="background:#fecaca;border:1px solid #ef4444;"></span> Deficient (&lt;2)</span>
                </div>
            </div>
        </div>
    `;
}

// ============================================================
// 6. NAVIGATION & SIDEBAR
// ============================================================
function navigateTo(page) {
    state.currentPage = page;
    renderPage(page);
    document.getElementById('sidebar')?.classList.remove('open');
}

function buildSidebar() {
    const nav = document.getElementById('sidebarNav');
    const isAdmin = state.currentRole === 'admin';
    let items = [];

    if (isAdmin) {
        items = [
            { label: 'Admin Heatmap', icon: 'fa-th', page: 'admin' },
        ];
    } else {
        items = [
            { label: 'Dashboard', icon: 'fa-chart-pie', page: 'dashboard' },
            { label: 'My Profile', icon: 'fa-user-circle', page: 'profile' },
            { label: 'Skill Gaps', icon: 'fa-exclamation-triangle', page: 'skillgaps' },
            { label: 'Learning Modules', icon: 'fa-graduation-cap', page: 'learning' },
            { label: 'Career Pathway', icon: 'fa-road', page: 'career' },
            { label: 'AI Assistant', icon: 'fa-robot', page: 'assistant' },
            { label: 'Assessment Gen', icon: 'fa-clipboard-list', page: 'assessment' },
        ];
    }

    nav.innerHTML = items.map(item => `
        <li><a href="#" data-page="${item.page}"><i class="fas ${item.icon}"></i> ${item.label}</a></li>
    `).join('');

    nav.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(a.dataset.page);
        });
    });

    nav.querySelectorAll('a').forEach(a => {
        a.classList.toggle('active', a.dataset.page === state.currentPage);
    });
}

// ============================================================
// 7. MODALS & NOTIFICATIONS
// ============================================================
function viewCourse(id, title, skill, description) {
    document.getElementById('courseModalBody').innerHTML = `
        <h4>${title}</h4>
        <p style="margin: 0.4rem 0;"><strong>Associated Competency:</strong> ${skill}</p>
        <p style="color:#475569;">${description}</p>
        <p style="margin-top:1rem;"><span class="badge badge-info">Capacity Building Certified</span></p>
    `;
    document.getElementById('courseModal').style.display = 'flex';
}

function showExplainability(title, skill, gap) {
    const body = document.getElementById('explainBody');
    body.innerHTML = `
        <div style="background:#f8fafc;padding:1rem;border-radius:12px;margin-bottom:1rem;">
            <p><strong>Recommended Target:</strong> ${title}</p>
            <p><strong>Identified Deficiency:</strong> ${skill}</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:0.5rem;">
            <div style="padding:0.4rem 0.75rem;background:#fff;border-radius:8px;">
                <strong>1. Algorithmic Gap Analysis:</strong> Detected ${skill} deficit of ${gap} tier(s).
            </div>
            <div style="padding:0.4rem 0.75rem;background:#f8fafc;border-radius:8px;">
                <strong>2. Deterministic Mapping:</strong> Course taxonomy directly bridges the required standard.
            </div>
        </div>
        <div style="margin-top:1.25rem;padding:0.75rem 1rem;background:#dbeafe;border-radius:12px;border-left:4px solid #2563eb;">
            <strong>Audit Trail:</strong> Verified deterministic calculation. Free of unconstrained bias.
        </div>
    `;
    document.getElementById('explainModal').style.display = 'flex';
}

function toggleNotifications() {
    const panel = document.getElementById('notifPanel');
    state.notificationsVisible = !state.notificationsVisible;
    panel.style.display = state.notificationsVisible ? 'block' : 'none';

    if (state.notificationsVisible) {
        const list = document.getElementById('notifList');
        list.innerHTML = `
            <li><i class="fas fa-graduation-cap"></i> Dynamic training recommendations generated.</li>
            <li><i class="fas fa-exclamation-triangle"></i> Data Analysis gap categorized as high priority.</li>
            <li><i class="fas fa-robot"></i> RAG AI assessment pipeline ready for document ingestion.</li>
        `;
    }
}

// ============================================================
// 8. EVENT LISTENERS & INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // Form & Role handlers
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    document.getElementById('demoLoginBtn')?.addEventListener('click', handleLogin);
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    document.getElementById('roleSwitchBtn')?.addEventListener('click', switchRole);

    // Notification handlers
    document.getElementById('notifBtn')?.addEventListener('click', toggleNotifications);
    document.getElementById('notifCloseBtn')?.addEventListener('click', () => {
        document.getElementById('notifPanel').style.display = 'none';
        state.notificationsVisible = false;
    });

    // Sidebar toggle (mobile view)
    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('open');
    });

    // Modal dismissals
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', function () {
            const modal = this.closest('.modal-overlay');
            if (modal) modal.style.setProperty('display','none','important');
        });
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', function (e) {
            if (e.target === this) this.style.display = 'none';
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay').forEach(m => m.style.setProperty('display','none','important'));
        }
    });

    document.querySelectorAll('.modal-overlay').forEach(m => m.style.setProperty('display','none','important'));

    // Session recovery from localStorage
    if (state.token) {
        fetchAPI('/auth/me')
            .then(user => {
                state.user = user;
                state.isLoggedIn = true;
                document.getElementById('loginScreen').style.display = 'none';
                document.getElementById('appContainer').style.display = 'flex';
                document.getElementById('userNameDisplay').textContent = state.user.name;
                document.getElementById('userRoleDisplay').textContent = state.user.designation;
                document.getElementById('userAvatar').textContent = state.user.initials;
                document.getElementById('sidebarUser').textContent = `${state.user.initials} Â· ${state.user.name}`;
                state.currentRole = state.user.is_admin ? 'admin' : 'learner';
                document.getElementById('roleLabel').textContent = state.currentRole === 'learner' ? '(Learner)' : '(Admin)';
                buildSidebar();
                navigateTo(state.user.is_admin ? 'admin' : 'dashboard');
            })
            .catch(() => handleLogout());
    }
});

// Expose handlers to global window for inline DOM calls
window.viewCourse = viewCourse;
window.showExplainability = showExplainability;
window.navigateTo = navigateTo;
window.resetAssessment = resetAssessment;










