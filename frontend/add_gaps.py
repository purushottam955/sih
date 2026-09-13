from pathlib import Path

p = Path("script.js")
s = p.read_text(encoding="cp1252")

if "const priorityGaps" not in s:
    old = "    const progress = Math.round(COMPETENCIES.reduce((sum, comp) => { const item = gapData.gaps[comp]; return sum + (item ? Math.min(item.current / Math.max(item.required, 1), 1) * 100 : 0); }, 0) / COMPETENCIES.length);"
    new = old + """

    const priorityGaps = Object.entries(gapData.gaps)
        .filter(([skill, item]) => item.gap > 0)
        .sort((a, b) => b[1].gap - a[1].gap)
        .slice(0, 3);"""

    if old in s:
        s = s.replace(old, new, 1)
    else:
        print("ERROR: Progress line not found.")

if "priority-gaps-card" not in s:
    marker = """            <div class="card">
                <div class="card-title"><i class="fas fa-chart-radar"></i> Live Competency Profile</div>"""

    card = """            <div class="card priority-gaps-card">
                <div class="card-title"><i class="fas fa-bullseye"></i> Priority Skill Gaps</div>
                <div class="priority-gaps-list">
                    ${priorityGaps.length ? priorityGaps.map(([skill, item]) => `
                        <div class="priority-gap-item">
                            <div>
                                <strong>${skill}</strong>
                                <div class="priority-gap-meta">Current Level ${item.current} - Required Level ${item.required}</div>
                            </div>
                            <span class="priority-gap-badge ${item.gap >= 2 ? "high" : "medium"}">
                                ${item.gap >= 2 ? "High Priority" : "Needs Improvement"} - Gap ${item.gap}
                            </span>
                        </div>
                    `).join("") : `
                        <div class="priority-gap-empty">
                            All competencies are aligned with the target role.
                        </div>
                    `}
                </div>
            </div>

""" + marker

    if marker in s:
        s = s.replace(marker, card, 1)
    else:
        print("ERROR: Radar marker not found.")

p.write_text(s, encoding="cp1252")
print("SUCCESS: Priority Skill Gaps added.")
