// ============================================================
// 1. DATA — SINGLE SOURCE OF TRUTH
// ============================================================
const APP_DATA = {
    user: {
        employeeId: 'MOSPI-2024-0142',
        name: 'Ananya Sharma',
        designation: 'Statistical Officer',
        department: 'Ministry of Statistics & Programme Implementation',
        qualification: 'M.Sc. Statistics',
        email: 'ananya.sharma@mospi.gov.in',
        initials: 'AS',
        targetRole: 'Senior Statistical Officer',
    },
    roles: {
        current: 'Statistical Officer',
        target: 'Senior Statistical Officer',
        possibleTargets: [
            'Senior Statistical Officer',
            'Deputy Director (Statistics)',
            'Joint Director (Statistics)',
            'Adviser (Statistics)',
        ],
    },
    competencies: ['Statistical', 'Data Analysis', 'Data Visualization', 'Digital Governance', 'Leadership'],
    requiredLevels: {
        'Statistical Officer': { Statistical: 4, 'Data Analysis': 3, 'Data Visualization': 3, 'Digital Governance': 2, Leadership: 2 },
        'Senior Statistical Officer': { Statistical: 5, 'Data Analysis': 4, 'Data Visualization': 4, 'Digital Governance': 3, Leadership: 3 },
        'Deputy Director (Statistics)': { Statistical: 5, 'Data Analysis': 5, 'Data Visualization': 4, 'Digital Governance': 4, Leadership: 4 },
        'Joint Director (Statistics)': { Statistical: 6, 'Data Analysis': 6, 'Data Visualization': 5, 'Digital Governance': 5, Leadership: 5 },
        'Adviser (Statistics)': { Statistical: 7, 'Data Analysis': 7, 'Data Visualization': 6, 'Digital Governance': 6, Leadership: 6 },
    },
    // Current assessed levels for Ananya
    assessedLevels: {
        Statistical: 4,
        'Data Analysis': 1,
        'Data Visualization': 2,
        'Digital Governance': 2,
        Leadership: 1,
    },
    courses: [
        { id: 'c1', title: 'Advanced Data Analysis', skill: 'Data Analysis', description: 'Deepen your statistical modeling and predictive analytics skills.' },
        { id: 'c2', title: 'Power BI Fundamentals', skill: 'Data Visualization', description: 'Master interactive dashboards and data storytelling with Power BI.' },
        { id: 'c3', title: 'Leadership Essentials', skill: 'Leadership', description: 'Build strategic leadership, team management, and decision-making capabilities.' },
        { id: 'c4', title: 'Advanced Statistics', skill: 'Statistical', description: 'Advanced inferential statistics, regression, and experimental design.' },
    ],
    // Mock knowledge base for RAG
    knowledgeBase: [
        { type: 'competency', content: 'Statistical Officer requires Statistical level 4, Data Analysis level 3, Data Visualization level 3, Digital Governance level 2, Leadership level 2.' },
        { type: 'competency', content: 'Senior Statistical Officer requires Statistical level 5, Data Analysis level 4, Data Visualization level 4, Digital Governance level 3, Leadership level 3.' },
        { type: 'profile', content: 'Ananya Sharma has Statistical level 4, Data Analysis level 1, Data Visualization level 2, Digital Governance level 2, Leadership level 1.' },
        { type: 'course', content: 'Advanced Data Analysis teaches Data Analysis. Power BI Fundamentals teaches Data Visualization. Leadership Essentials teaches Leadership. Advanced Statistics teaches Statistical.' },
        { type: 'career', content: 'To become Senior Statistical Officer, you need to close gaps in Data Analysis (gap 2), Data Visualization (gap 1), and Leadership (gap 1).' },
    ],
    notifications: [
        { icon: 'fa-graduation-cap', text: 'New course recommendation available.' },
        { icon: 'fa-exclamation-triangle', text: 'Your Data Analysis competency gap is high priority.' },
        { icon: 'fa-clipboard-list', text: 'Assessment available for Data Analysis.' },
        { icon: 'fa-road', text: 'Career pathway updated for Senior Statistical Officer.' },
    ],
    adminEmployees: [
        { name: 'Ananya Sharma', dept: 'MoSPI', competencies: { Statistical: 4, 'Data Analysis': 1, 'Data Visualization': 2, 'Digital Governance': 2, Leadership: 1 } },
        { name: 'Vikram Singh', dept: 'MoSPI', competencies: { Statistical: 5, 'Data Analysis': 3, 'Data Visualization': 4, 'Digital Governance': 3, Leadership: 2 } },
        { name: 'Priya Patel', dept: 'MoSPI', competencies: { Statistical: 3, 'Data Analysis': 2, 'Data Visualization': 1, 'Digital Governance': 2, Leadership: 3 } },
        { name: 'Rahul Mehta', dept: 'MoSPI', competencies: { Statistical: 4, 'Data Analysis': 4, 'Data Visualization': 3, 'Digital Governance': 4, Leadership: 1 } },
    ],
    assessmentQuestions: [
        { id: 'q1', competency: 'Data Analysis', question: 'What is the primary purpose of exploratory data analysis (EDA)?', options: ['To confirm hypotheses', 'To visualize and summarize data', 'To build predictive models', 'To clean data'], correct: 1 },
        { id: 'q2', competency: 'Data Analysis', question: 'Which statistical test is used to compare means between two groups?', options: ['Chi-square', 't-test', 'ANOVA', 'Correlation'], correct: 1 },
        { id: 'q3', competency: 'Data Visualization', question: 'Which chart is best for showing part-to-whole relationships?', options: ['Bar chart', 'Line chart', 'Pie chart', 'Scatter plot'], correct: 2 },
        { id: 'q4', competency: 'Leadership', question: 'Which leadership style focuses on inspiring and motivating followers?', options: ['Autocratic', 'Transformational', 'Laissez-faire', 'Bureaucratic'], correct: 1 },
    ],
};

// ============================================================
// 2. APPLICATION STATE
// ============================================================
let state = {
    isLoggedIn: false,
    currentPage: 'dashboard',
    currentRole: 'learner', // 'learner' | 'admin'
    selectedTargetRole: 'Senior Statistical Officer',
    chatHistory: [],
    isChatting: false,
    assessmentFile: null,
    assessmentAnswers: {},
    assessmentSubmitted: false,
    assessmentScore: null,
    notificationsVisible: false,
};

// ============================================================
// 3. COMPETENCY GAP ENGINE
// ============================================================
function getRequiredLevels(role) {
    return APP_DATA.requiredLevels[role] || APP_DATA.requiredLevels['Statistical Officer'];
}

function getGaps(role) {
    const required = getRequiredLevels(role);
    const current = APP_DATA.assessedLevels;
    const gaps = {};
    let totalGap = 0;
    APP_DATA.competencies.forEach(comp => {
        const req = required[comp] || 0;
        const cur = current[comp] || 0;
        const gap = req - cur;
        gaps[comp] = { required: req, current: cur, gap: gap };
        totalGap += Math.max(0, gap);
    });
    return { gaps, totalGap };
}

function getGapSeverity(gap) {
    if (gap <= 0) return { label: 'No Gap', badge: 'badge-success', icon: '✅' };
    if (gap === 1) return { label: 'Low Gap', badge: 'badge-warning', icon: '⚠️' };
    return { label: 'High Gap', badge: 'badge-danger', icon: '❌' };
}

function getRecommendedCourses(role) {
    const { gaps } = getGaps(role);
    const recommended = [];
    APP_DATA.courses.forEach(course => {
        const comp = course.skill;
        if (gaps[comp] && gaps[comp].gap > 0) {
            const severity = getGapSeverity(gaps[comp].gap);
            recommended.push({
                ...course,
                gap: gaps[comp].gap,
                severity: severity,
                reason: `Addresses ${comp} competency gap of ${gaps[comp].gap} level(s).`,
            });
        }
    });
    // sort by gap descending
    recommended.sort((a, b) => b.gap - a.gap);
    return recommended;
}

// ============================================================
// 4. EXPLAINABILITY TRAIL
// ============================================================
function buildExplainTrail(courseId, role) {
    const course = APP_DATA.courses.find(c => c.id === courseId);
    if (!course) return null;
    const comp = course.skill;
    const { gaps } = getGaps(role);
    const gapData = gaps[comp];
    if (!gapData || gapData.gap <= 0) return null;
    const severity = getGapSeverity(gapData.gap);
    return {
        course: course,
        competency: comp,
        required: gapData.required,
        current: gapData.current,
        gap: gapData.gap,
        severity: severity,
        steps: [
            { label: 'Employee competency', value: `${comp}: Level ${gapData.current}` },
            { label: 'Required competency level', value: `${comp}: Level ${gapData.required}` },
            { label: 'Current assessed level', value: `Level ${gapData.current}` },
            { label: 'Gap calculation', value: `${gapData.required} − ${gapData.current} = ${gapData.gap}` },
            { label: 'Priority', value: severity.label },
            { label: 'Matching competency', value: comp },
            { label: 'Recommended course', value: course.title },
        ],
        finalReason: `This course directly addresses the employee's ${comp} competency gap of ${gapData.gap} level(s).`,
    };
}

// ============================================================
// 5. MOCK RAG RETRIEVAL
// ============================================================
function mockRAG(query) {
    const q = query.toLowerCase();
    const results = [];
    // simple keyword matching
    APP_DATA.knowledgeBase.forEach(item => {
        if (item.content.toLowerCase().includes(q) || q.split(' ').some(word => item.content.toLowerCase().includes(word))) {
            results.push(item.content);
        }
    });
    if (results.length === 0) {
        // fallback
        return "I couldn't find specific information on that. Please check your competency profile or course recommendations.";
    }
    return results.join(' ');
}

// ============================================================
// 6. AI ASSISTANT RESPONSE GENERATOR
// ============================================================
function generateAssistantResponse(userMessage) {
    const msg = userMessage.toLowerCase();
    let response = '';
    const { gaps } = getGaps(state.selectedTargetRole);
    const recommended = getRecommendedCourses(state.selectedTargetRole);

    if (msg.includes('skill gap') || msg.includes('biggest gap')) {
        let gapText = '';
        let highest = null;
        let highestComp = '';
        APP_DATA.competencies.forEach(comp => {
            if (gaps[comp] && gaps[comp].gap > 0) {
                if (!highest || gaps[comp].gap > highest) {
                    highest = gaps[comp].gap;
                    highestComp = comp;
                }
            }
        });
        if (highestComp) {
            gapText = `Your biggest gap is ${highestComp}, where your current level is ${gaps[highestComp].current} and the required level is ${gaps[highestComp].required}. This creates a gap of ${highest} levels.`;
        } else {
            gapText = 'You have no competency gaps. Great job!';
        }
        response = gapText + ' ' + mockRAG('competency gap');
    } else if (msg.includes('learn next') || msg.includes('recommend')) {
        if (recommended.length > 0) {
            const top = recommended[0];
            response = `I recommend you start with "${top.title}" which addresses ${top.skill} (gap ${top.gap} levels). ${top.reason} ` + mockRAG('course recommendation');
        } else {
            response = 'You are fully aligned with your target role. No additional courses needed at this time.';
        }
    } else if (msg.includes('why') && msg.includes('course') || msg.includes('recommended')) {
        // try to find a course mention
        let courseFound = null;
        APP_DATA.courses.forEach(c => {
            if (msg.includes(c.title.toLowerCase()) || msg.includes(c.skill.toLowerCase())) {
                courseFound = c;
            }
        });
        if (courseFound) {
            const trail = buildExplainTrail(courseFound.id, state.selectedTargetRole);
            if (trail) {
                response = `The recommendation for "${courseFound.title}" is based on your competency gap in ${trail.competency}. Required level: ${trail.required}, your current level: ${trail.current}, gap: ${trail.gap}. ${trail.finalReason}`;
            } else {
                response = `"${courseFound.title}" is recommended to strengthen your ${courseFound.skill} skills.`;
            }
        } else {
            response = 'I can explain any course recommendation. Please mention a specific course like "Advanced Data Analysis".';
        }
    } else if (msg.includes('senior statistical officer') || msg.includes('target role') || msg.includes('become')) {
        const target = state.selectedTargetRole;
        const { gaps: roleGaps } = getGaps(target);
        let gapSummary = '';
        APP_DATA.competencies.forEach(comp => {
            if (roleGaps[comp] && roleGaps[comp].gap > 0) {
                gapSummary += ` ${comp} (gap ${roleGaps[comp].gap}),`;
            }
        });
        if (gapSummary) {
            gapSummary = gapSummary.slice(0, -1);
            response = `To become a ${target}, you need to close gaps in:${gapSummary}. I recommend starting with the highest priority course. ` + mockRAG('career');
        } else {
            response = `You already meet all competency requirements for ${target}. Consider exploring higher roles.`;
        }
    } else {
        // fallback with RAG
        const ragResult = mockRAG(msg);
        if (ragResult && ragResult.length > 10) {
            response = ragResult;
        } else {
            response = 'I can help with questions about your skill gaps, course recommendations, career progression, or the explainability trail. Try one of the suggested prompts.';
        }
    }
    return response;
}

// ============================================================
// 7. RENDER FUNCTIONS (PAGES)
// ============================================================
function renderPage(page) {
    const main = document.getElementById('mainContent');
    switch (page) {
        case 'dashboard':
            renderDashboard(main);
            break;
        case 'profile':
            renderProfile(main);
            break;
        case 'skillgaps':
            renderSkillGaps(main);
            break;
        case 'learning':
            renderLearning(main);
            break;
        case 'career':
            renderCareer(main);
            break;
        case 'assistant':
            renderAssistant(main);
            break;
        case 'assessment':
            renderAssessment(main);
            break;
        case 'admin':
            renderAdmin(main);
            break;
        default:
            renderDashboard(main);
    }
    // update sidebar active
    document.querySelectorAll('.sidebar-nav a').forEach(a => {
        a.classList.toggle('active', a.dataset.page === page);
    });
}

// ----- DASHBOARD -----
function renderDashboard(container) {
    const { gaps } = getGaps(state.selectedTargetRole);
    let totalGaps = 0,
        highGaps = 0,
        lowGaps = 0;
    APP_DATA.competencies.forEach(c => {
        if (gaps[c] && gaps[c].gap > 0) {
            totalGaps++;
            if (gaps[c].gap >= 2) highGaps++;
            else lowGaps++;
        }
    });
    const recommended = getRecommendedCourses(state.selectedTargetRole);
    const progress = Math.max(0, 100 - (totalGaps / APP_DATA.competencies.length) * 100);

    container.innerHTML = `
        <div class="page">
            <div class="page-header">
                <h2><i class="fas fa-chart-pie"></i> Dashboard</h2>
                <p>Welcome back, ${APP_DATA.user.name} 👋 Your competency profile is being evaluated against your target role.</p>
                <p><strong>Target Role:</strong> ${state.selectedTargetRole}</p>
            </div>
            <div class="card-grid">
                <div class="stat-card">
                    <div class="stat-label">Competencies Assessed</div>
                    <div class="stat-value">${APP_DATA.competencies.length}</div>
                    <div class="stat-sub">Across 5 domains</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Critical Gaps</div>
                    <div class="stat-value" style="color:${highGaps > 0 ? '#ef4444' : '#22c55e'}">${highGaps}</div>
                    <div class="stat-sub">${highGaps > 0 ? 'Requires immediate attention' : 'All clear'}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Courses Recommended</div>
                    <div class="stat-value">${recommended.length}</div>
                    <div class="stat-sub">Based on your gaps</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Learning Progress</div>
                    <div class="stat-value">${Math.round(progress)}%</div>
                    <div class="progress-bar"><div class="fill ${progress > 70 ? 'success' : progress > 40 ? 'warning' : 'danger'}" style="width:${progress}%"></div></div>
                </div>
            </div>
            <div class="card">
                <div class="card-title"><i class="fas fa-chart-radar"></i> Competency Profile</div>
                <div class="chart-wrapper"><canvas id="radarChart"></canvas></div>
            </div>
        </div>
    `;
    // init radar chart after DOM update
    setTimeout(() => initRadarChart(), 50);
}

// ----- PROFILE -----
function renderProfile(container) {
    const user = APP_DATA.user;
    const { gaps } = getGaps(state.selectedTargetRole);
    container.innerHTML = `
        <div class="page">
            <div class="page-header"><h2><i class="fas fa-user-circle"></i> My Profile</h2></div>
            <div class="card" style="width:100%; max-width:none;">
                <div style="display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap;">
                    <div style="width:80px;height:80px;border-radius:50%;background:#4f46e5;display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:700;color:#fff;">${user.initials}</div>
                    <div>
                        <h3 style="font-size:1.25rem;">${user.name}</h3>
                        <p style="color:#64748b;">${user.designation} · ${user.department}</p>
                        <p style="font-size:0.85rem;color:#64748b;"><i class="fas fa-id-badge"></i> ${user.employeeId} &nbsp;|&nbsp; <i class="fas fa-envelope"></i> ${user.email}</p>
                        <p style="font-size:0.85rem;color:#64748b;"><i class="fas fa-graduation-cap"></i> ${user.qualification}</p>
                        <p style="font-size:0.85rem;color:#2563eb;"><strong>Target Role:</strong> ${state.selectedTargetRole}</p>
                    </div>
                </div>
                <hr style="margin:1rem 0;">
                <h4 style="margin-bottom:0.5rem;">Competency Profile</h4>
                ${APP_DATA.competencies.map(c => {
                    const g = gaps[c];
                    const sev = getGapSeverity(g ? g.gap : 0);
                    return `<div style="display:flex;justify-content:space-between;padding:0.3rem 0;border-bottom:1px solid #f1f5f9;">
                        <span>${c}</span>
                        <span>Current: Level ${g ? g.current : 0} &nbsp; Required: Level ${g ? g.required : 0} &nbsp; <span class="badge ${sev.badge}">${sev.icon} ${sev.label}</span></span>
                    </div>`;
                }).join('')}
            </div>
        </div>
    `;
}

// ----- SKILL GAPS -----
function renderSkillGaps(container) {
    const { gaps } = getGaps(state.selectedTargetRole);
    container.innerHTML = `
        <div class="page">
            <div class="page-header"><h2><i class="fas fa-exclamation-triangle"></i> Skill Gaps</h2>
                <p>Competency gaps calculated by rules engine: <strong>Required Level − Current Level</strong></p>
            </div>
            <div class="card">
                <div class="table-responsive">
                    <table>
                        <thead><tr><th>Competency</th><th>Required Level</th><th>Current Level</th><th>Gap</th><th>Priority</th></tr></thead>
                        <tbody>
                            ${APP_DATA.competencies.map(c => {
                                const g = gaps[c];
                                if (!g) return '';
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
                <div style="margin-top:0.75rem;font-size:0.85rem;color:#64748b;">
                    <span class="badge badge-success">✅ No gap</span>
                    <span class="badge badge-warning">⚠️ Low gap</span>
                    <span class="badge badge-danger">❌ High gap</span>
                </div>
            </div>
            <div class="card" style="background:#f8fafc;">
                <h4 style="font-weight:600;">🧠 What skills should I have? (${APP_DATA.roles.current})</h4>
                ${APP_DATA.competencies.map(c => {
                    const req = getRequiredLevels(APP_DATA.roles.current);
                    return `<div style="display:flex;justify-content:space-between;padding:0.25rem 0;border-bottom:1px solid #e2e8f0;"><span>${c}</span><span>Level ${req[c] || 0}</span></div>`;
                }).join('')}
                <hr style="margin:1rem 0;">
                <h4 style="font-weight:600;">📊 What skills am I missing?</h4>
                ${APP_DATA.competencies.map(c => {
                    const g = gaps[c];
                    if (!g || g.gap <= 0) return `<div style="padding:0.25rem 0;color:#64748b;">${c}: ✅ No gap (Level ${g ? g.current : 0} / ${g ? g.required : 0})</div>`;
                    const sev = getGapSeverity(g.gap);
                    return `<div style="padding:0.25rem 0;border-bottom:1px solid #f1f5f9;"><strong>${c}</strong> Required: ${g.required}, Current: ${g.gap > 0 ? g.current : g.current} Gap: ${g.gap} <span class="badge ${sev.badge}">${sev.label}</span></div>`;
                }).join('')}
                <p style="margin-top:0.75rem;font-size:0.8rem;color:#64748b;"><i class="fas fa-cogs"></i> The rules engine performs this calculation deterministically.</p>
            </div>
        </div>
    `;
}

// ----- LEARNING -----
function renderLearning(container) {
    const recommended = getRecommendedCourses(state.selectedTargetRole);
    container.innerHTML = `
        <div class="page">
            <div class="page-header"><h2><i class="fas fa-graduation-cap"></i> Learning Recommendations</h2>
                <p>Courses recommended based on your competency gaps.</p>
            </div>
            ${recommended.length === 0 ? '<div class="card"><p>You have no gaps. Great work!</p></div>' : `
            <div class="course-grid">
                ${recommended.map(c => `
                    <div class="course-card">
                        <h4>${c.title}</h4>
                        <div class="course-skill"><i class="fas fa-tag"></i> ${c.skill}</div>
                        <div class="course-reason">${c.reason}</div>
                        <div class="course-priority"><span class="badge ${c.severity.badge}">${c.severity.icon} ${c.severity.label}</span></div>
                        <div class="course-actions">
                            <button class="btn btn-sm btn-primary" onclick="viewCourse('${c.id}')">View Course</button>
                            <button class="btn btn-sm btn-outline" onclick="showExplainability('${c.id}')">Why recommended?</button>
                        </div>
                    </div>
                `).join('')}
            </div>`}
        </div>
    `;
}

// ----- CAREER -----
function renderCareer(container) {
    const target = state.selectedTargetRole;
    const { gaps } = getGaps(target);
    const recommended = getRecommendedCourses(target);
    const steps = recommended.map((c, i) => `Step ${i+1}: ${c.title} (${c.skill})`).concat(['Step ' + (recommended.length+1) + ': Reassessment']);

    container.innerHTML = `
        <div class="page">
            <div class="page-header"><h2><i class="fas fa-road"></i> Career Navigator</h2>
                <p>Select your target role to see the learning path.</p>
            </div>
            <div class="card">
                <label style="font-weight:600;display:block;margin-bottom:0.4rem;">Select Target Role</label>
                <select id="targetRoleSelect" style="padding:0.5rem 1rem;border-radius:12px;border:1.5px solid #e2e8f0;font-size:0.95rem;width:100%;max-width:300px;">
                    ${APP_DATA.roles.possibleTargets.map(r => `<option value="${r}" ${r === target ? 'selected' : ''}>${r}</option>`).join('')}
                </select>
            </div>
            <div class="card">
                <h4>Target Role: <strong>${target}</strong></h4>
                <div style="margin:0.75rem 0;">
                    <p><strong>Priority Gaps:</strong></p>
                    ${APP_DATA.competencies.map(c => {
                        const g = gaps[c];
                        if (!g || g.gap <= 0) return '';
                        const sev = getGapSeverity(g.gap);
                        const color = g.gap >= 2 ? '🔴' : g.gap === 1 ? '🟠' : '🟡';
                        return `<div>${color} ${c} (gap ${g.gap})</div>`;
                    }).join('') || '<p style="color:#22c55e;">✅ No gaps for this role.</p>'}
                </div>
                <h4>Suggested Learning Path</h4>
                <ol style="padding-left:1.25rem;margin-top:0.5rem;">
                    ${steps.map(s => `<li style="padding:0.25rem 0;">${s}</li>`).join('')}
                </ol>
                <p style="font-size:0.8rem;color:#64748b;margin-top:0.75rem;"><i class="fas fa-sync-alt"></i> Path is generated based on competency requirements and gaps.</p>
            </div>
        </div>
    `;
    document.getElementById('targetRoleSelect')?.addEventListener('change', function() {
        state.selectedTargetRole = this.value;
        navigateTo('career');
    });
}

// ----- AI ASSISTANT -----
function renderAssistant(container) {
    container.innerHTML = `
        <div class="page">
            <div class="page-header"><h2><i class="fas fa-robot"></i> AI Assistant <span style="font-size:0.7rem;background:#dbeafe;padding:0.15rem 0.7rem;border-radius:50px;color:#1e40af;font-weight:400;">RAG Enabled</span></h2></div>
            <div class="chat-container" id="chatContainer">
                <div class="chat-messages" id="chatMessages">
                    ${state.chatHistory.map(msg => `
                        <div class="chat-msg ${msg.role}">
                            <div class="msg-label">${msg.role === 'user' ? 'You' : 'Assistant'}</div>
                            ${msg.text}
                        </div>
                    `).join('')}
                    ${state.chatHistory.length === 0 ? `<div class="chat-msg assistant"><div class="msg-label">Assistant</div>Hello! I'm your AI learning assistant. How can I help you today?</div>` : ''}
                </div>
                <div class="chat-suggestions">
                    <button data-prompt="What are my biggest skill gaps?">What are my biggest skill gaps?</button>
                    <button data-prompt="What should I learn next?">What should I learn next?</button>
                    <button data-prompt="Why was this course recommended?">Why was this course recommended?</button>
                    <button data-prompt="How can I become a Senior Statistical Officer?">How can I become a Senior Statistical Officer?</button>
                </div>
                <div class="chat-input-area">
                    <input type="text" id="chatInput" placeholder="Type your question..." />
                    <button id="chatSendBtn"><i class="fas fa-paper-plane"></i> Send</button>
                </div>
            </div>
        </div>
    `;
    // scroll to bottom
    const msgs = document.getElementById('chatMessages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;

    // event listeners
    document.getElementById('chatSendBtn')?.addEventListener('click', () => sendChatMessage());
    document.getElementById('chatInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatMessage(); });
    document.querySelectorAll('.chat-suggestions button').forEach(btn => {
        btn.addEventListener('click', function() {
            document.getElementById('chatInput').value = this.dataset.prompt;
            sendChatMessage();
        });
    });
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    // add user message
    state.chatHistory.push({ role: 'user', text: msg });
    renderAssistant(document.getElementById('mainContent'));
    // show typing
    const container = document.getElementById('chatMessages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    typingDiv.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(typingDiv);
    container.scrollTop = container.scrollHeight;

    // simulate response
    setTimeout(() => {
        // remove typing
        const typing = container.querySelector('.typing-indicator');
        if (typing) typing.remove();
        const response = generateAssistantResponse(msg);
        state.chatHistory.push({ role: 'assistant', text: response });
        renderAssistant(document.getElementById('mainContent'));
        const msgs = document.getElementById('chatMessages');
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }, 900 + Math.random() * 600);
}

// ----- ASSESSMENT -----
function renderAssessment(container) {
    const file = state.assessmentFile;
    const questions = APP_DATA.assessmentQuestions;
    const submitted = state.assessmentSubmitted;

    container.innerHTML = `
        <div class="page">
            <div class="page-header"><h2><i class="fas fa-clipboard-list"></i> Assessment Generator</h2>
                <p>Upload training material to generate a mock assessment.</p>
            </div>
            <div class="card">
                <div class="upload-area" id="uploadArea">
                    <i class="fas fa-cloud-upload-alt"></i>
                    <p>Upload Training Material (PDF / DOC / DOCX / TXT)</p>
                    <div class="file-name">${file ? file.name : 'No file selected'}</div>
                    <input type="file" id="fileInput" accept=".pdf,.doc,.docx,.txt" style="display:none;" />
                </div>
                <button id="generateAssessBtn" class="btn btn-primary" style="margin-top:0.75rem;" ${file ? '' : 'disabled'}>Generate Assessment</button>
            </div>
            ${submitted ? `
                <div class="card">
                    <h4>Results</h4>
                    <p>Score: ${state.assessmentScore !== null ? state.assessmentScore + '/' + questions.length : 'N/A'}</p>
                    <button class="btn btn-secondary" onclick="resetAssessment()">Reassessment</button>
                </div>
            ` : (state.assessmentGenerated ? `
                <div class="card">
                    <h4>Assessment: Data Analysis</h4>
                    ${questions.map((q, idx) => `
                        <div class="question-block" data-qid="${q.id}">
                            <p><strong>Q${idx+1}:</strong> ${q.question}</p>
                            <div class="options">
                                ${q.options.map((opt, oi) => `
                                    <label><input type="radio" name="q${q.id}" value="${oi}" ${state.assessmentAnswers[q.id] === oi ? 'checked' : ''} /> ${opt}</label>
                                `).join('')}
                            </div>
                            ${state.assessmentAnswers[q.id] !== undefined ? `
                                <div style="margin-top:0.4rem;">
                                    ${state.assessmentAnswers[q.id] === q.correct ? '<span class="feedback-correct">✓ Correct</span>' : '<span class="feedback-wrong">✗ Incorrect</span>'}
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                    <button class="btn btn-primary" id="submitAssessBtn">Submit Assessment</button>
                </div>
            ` : '')}
        </div>
    `;

    // upload handlers
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    if (uploadArea && fileInput) {
        uploadArea.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', function(e) {
            if (this.files.length > 0) {
                state.assessmentFile = this.files[0];
                state.assessmentGenerated = false;
                state.assessmentSubmitted = false;
                state.assessmentAnswers = {};
                state.assessmentScore = null;
                renderAssessment(document.getElementById('mainContent'));
            }
        });
    }
    document.getElementById('generateAssessBtn')?.addEventListener('click', function() {
        if (state.assessmentFile) {
            state.assessmentGenerated = true;
            state.assessmentSubmitted = false;
            state.assessmentAnswers = {};
            state.assessmentScore = null;
            renderAssessment(document.getElementById('mainContent'));
        }
    });
    document.getElementById('submitAssessBtn')?.addEventListener('click', function() {
        let correct = 0;
        questions.forEach(q => {
            const ans = state.assessmentAnswers[q.id];
            if (ans !== undefined && ans === q.correct) correct++;
            // if not answered, mark wrong
        });
        state.assessmentScore = correct;
        state.assessmentSubmitted = true;
        renderAssessment(document.getElementById('mainContent'));
        // show result modal
        document.getElementById('assessmentResultBody').innerHTML = `
            <p>You scored <strong>${correct}</strong> out of ${questions.length}.</p>
            <p>${correct === questions.length ? 'Perfect score! 🎉' : correct >= questions.length/2 ? 'Good effort! Keep learning.' : 'Review the material and try again.'}</p>
        `;
        document.getElementById('assessmentResultModal').style.display = 'flex';
    });
    // radio change
    document.querySelectorAll('.question-block input[type="radio"]').forEach(el => {
        el.addEventListener('change', function() {
            const qid = this.name.replace('q', '');
            state.assessmentAnswers[qid] = parseInt(this.value);
        });
    });
}

function resetAssessment() {
    state.assessmentSubmitted = false;
    state.assessmentScore = null;
    state.assessmentAnswers = {};
    renderAssessment(document.getElementById('mainContent'));
}

// ----- ADMIN DASHBOARD -----
function renderAdmin(container) {
    const employees = APP_DATA.adminEmployees;
    const comps = APP_DATA.competencies;
    container.innerHTML = `
        <div class="page">
            <div class="page-header"><h2><i class="fas fa-users-cog"></i> Admin Dashboard</h2>
                <p>Organization-wide competency heatmap.</p>
            </div>
            <div class="card">
                <div class="table-responsive">
                    <div class="heatmap-grid">
                        <div class="header">Employee</div>
                        ${comps.map(c => `<div class="header" style="text-align:center;">${c}</div>`).join('')}
                        ${employees.map(emp => `
                            <div class="header" style="font-weight:500;">${emp.name}</div>
                            ${comps.map(c => {
                                const val = emp.competencies[c] || 0;
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
                    <span class="legend-item"><span class="swatch" style="background:#dcfce7;"></span> High (≥4)</span>
                    <span class="legend-item"><span class="swatch" style="background:#fef9c3;"></span> Moderate (3)</span>
                    <span class="legend-item"><span class="swatch" style="background:#fee2e2;"></span> Low (2)</span>
                    <span class="legend-item"><span class="swatch" style="background:#fecaca;border:1px solid #ef4444;"></span> Critical (&lt;2)</span>
                </div>
            </div>
        </div>
    `;
}

// ============================================================
// 8. NAVIGATION
// ============================================================
function navigateTo(page) {
    state.currentPage = page;
    renderPage(page);
    // close sidebar on mobile
    document.getElementById('sidebar')?.classList.remove('open');
}

// ============================================================
// 9. SIDEBAR BUILD
// ============================================================
function buildSidebar() {
    const nav = document.getElementById('sidebarNav');
    const isAdmin = state.currentRole === 'admin';
    let items = [];
    if (isAdmin) {
        items = [
            { label: 'Admin Dashboard', icon: 'fa-chart-pie', page: 'admin' },
            { label: 'Heatmap', icon: 'fa-th', page: 'admin' },
        ];
    } else {
        items = [
            { label: 'Dashboard', icon: 'fa-chart-pie', page: 'dashboard' },
            { label: 'My Profile', icon: 'fa-user-circle', page: 'profile' },
            { label: 'Skill Gaps', icon: 'fa-exclamation-triangle', page: 'skillgaps' },
            { label: 'Learning', icon: 'fa-graduation-cap', page: 'learning' },
            { label: 'Career Navigator', icon: 'fa-road', page: 'career' },
            { label: 'AI Assistant', icon: 'fa-robot', page: 'assistant' },
            { label: 'Assessment', icon: 'fa-clipboard-list', page: 'assessment' },
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
    // set active
    nav.querySelectorAll('a').forEach(a => {
        a.classList.toggle('active', a.dataset.page === state.currentPage);
    });
}

// ============================================================
// 10. RADAR CHART (Chart.js)
// ============================================================
let radarChartInstance = null;

function initRadarChart() {
    const canvas = document.getElementById('radarChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (radarChartInstance) { radarChartInstance.destroy();
        radarChartInstance = null; }
    const { gaps } = getGaps(state.selectedTargetRole);
    const labels = APP_DATA.competencies;
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

// ============================================================
// 11. COURSE VIEW & EXPLAINABILITY
// ============================================================
function viewCourse(courseId) {
    const course = APP_DATA.courses.find(c => c.id === courseId);
    if (!course) return;
    document.getElementById('courseModalBody').innerHTML = `
        <h4>${course.title}</h4>
        <p><strong>Skill:</strong> ${course.skill}</p>
        <p>${course.description}</p>
        <p style="margin-top:0.5rem;"><span class="badge badge-info">Recommended based on your gap</span></p>
    `;
    document.getElementById('courseModal').style.display = 'flex';
}

function showExplainability(courseId) {
    const trail = buildExplainTrail(courseId, state.selectedTargetRole);
    if (!trail) {
        alert('No gap found for this course.');
        return;
    }
    const body = document.getElementById('explainBody');
    body.innerHTML = `
        <div style="background:#f8fafc;padding:1rem;border-radius:12px;margin-bottom:1rem;">
            <p><strong>Course:</strong> ${trail.course.title}</p>
            <p><strong>Competency:</strong> ${trail.competency}</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:0.5rem;">
            ${trail.steps.map((s, i) => `
                <div style="display:flex;align-items:center;gap:0.75rem;padding:0.4rem 0.75rem;background:${i % 2 === 0 ? '#fff' : '#f8fafc'};border-radius:8px;">
                    <span style="font-weight:500;min-width:140px;">${s.label}</span>
                    <span style="color:#0f172a;">${s.value}</span>
                </div>
            `).join('')}
        </div>
        <div style="margin-top:1.25rem;padding:0.75rem 1rem;background:#dbeafe;border-radius:12px;border-left:4px solid #2563eb;">
            <strong>Final Reason:</strong> ${trail.finalReason}
        </div>
        <div style="margin-top:0.75rem;font-size:0.75rem;color:#64748b;">
            <i class="fas fa-cogs"></i> Determined by rules engine. No AI black box.
        </div>
    `;
    document.getElementById('explainModal').style.display = 'flex';
}

// ============================================================
// 12. NOTIFICATIONS
// ============================================================
function toggleNotifications() {
    const panel = document.getElementById('notifPanel');
    state.notificationsVisible = !state.notificationsVisible;
    panel.style.display = state.notificationsVisible ? 'block' : 'none';
    if (state.notificationsVisible) {
        const list = document.getElementById('notifList');
        list.innerHTML = APP_DATA.notifications.map(n => `
            <li><i class="fas ${n.icon}"></i> ${n.text}</li>
        `).join('');
    }
}

// ============================================================
// 13. LOGIN / LOGOUT
// ============================================================
function handleLogin() {
    state.isLoggedIn = true;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appContainer').style.display = 'flex';
    // set user info
    document.getElementById('userNameDisplay').textContent = APP_DATA.user.name;
    document.getElementById('userRoleDisplay').textContent = APP_DATA.user.designation;
    document.getElementById('userAvatar').textContent = APP_DATA.user.initials;
    document.getElementById('sidebarUser').textContent = `${APP_DATA.user.initials} · ${APP_DATA.user.name}`;
    state.currentRole = 'learner';
    state.currentPage = 'dashboard';
    buildSidebar();
    renderPage('dashboard');
}

function handleLogout() {
    state.isLoggedIn = false;
    state.chatHistory = [];
    document.getElementById('appContainer').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('notifPanel').style.display = 'none';
    document.getElementById('sidebar')?.classList.remove('open');
}

// ============================================================
// 14. ROLE SWITCHING
// ============================================================
function switchRole() {
    state.currentRole = state.currentRole === 'learner' ? 'admin' : 'learner';
    document.getElementById('roleLabel').textContent = state.currentRole === 'learner' ? '(Learner)' : '(Admin)';
    // if admin, navigate to admin, else dashboard
    if (state.currentRole === 'admin') {
        state.currentPage = 'admin';
    } else {
        state.currentPage = 'dashboard';
    }
    buildSidebar();
    renderPage(state.currentPage);
}

// ============================================================
// 15. MODAL CLOSE HANDLERS
// ============================================================
function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
}

// ============================================================
// 16. EVENT LISTENERS & INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    // Login form
    document.getElementById('loginForm').addEventListener('submit', function(e) {
        e.preventDefault();
        handleLogin();
    });
    document.getElementById('demoLoginBtn').addEventListener('click', handleLogin);

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Role switch
    document.getElementById('roleSwitchBtn').addEventListener('click', switchRole);

    // Notifications
    document.getElementById('notifBtn').addEventListener('click', toggleNotifications);
    document.getElementById('notifCloseBtn').addEventListener('click', () => {
        document.getElementById('notifPanel').style.display = 'none';
        state.notificationsVisible = false;
    });

    // Sidebar toggle
    document.getElementById('sidebarToggle').addEventListener('click', function() {
        document.getElementById('sidebar').classList.toggle('open');
    });

    // Modal closes
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal-overlay');
            if (modal) modal.style.display = 'none';
        });
    });
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', function(e) {
            if (e.target === this) this.style.display = 'none';
        });
    });

    // Keyboard shortcut: Escape closes modals
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeModals();
    });

    // Ensure login screen is visible initially
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appContainer').style.display = 'none';
});

// Expose functions to global scope for inline onclick
window.viewCourse = viewCourse;
window.showExplainability = showExplainability;
window.navigateTo = navigateTo;
window.resetAssessment = resetAssessment;
window.sendChatMessage = sendChatMessage;