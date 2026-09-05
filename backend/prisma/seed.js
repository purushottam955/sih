const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function main() {
  // ----- Competencies -----
  const comps = await Promise.all([
    prisma.competency.create({ data: { name: 'Statistical' } }),
    prisma.competency.create({ data: { name: 'Data Analysis' } }),
    prisma.competency.create({ data: { name: 'Data Visualization' } }),
    prisma.competency.create({ data: { name: 'Digital Governance' } }),
    prisma.competency.create({ data: { name: 'Leadership' } }),
  ]);
  const compMap = {};
  comps.forEach(c => compMap[c.name] = c);

  // ----- Roles -----
  const roles = await Promise.all([
    prisma.role.create({ data: { name: 'Statistical Officer', description: 'Entry-level statistical officer' } }),
    prisma.role.create({ data: { name: 'Senior Statistical Officer', description: 'Senior statistical officer' } }),
    prisma.role.create({ data: { name: 'Deputy Director (Statistics)', description: 'Deputy director' } }),
    prisma.role.create({ data: { name: 'Joint Director (Statistics)', description: 'Joint director' } }),
    prisma.role.create({ data: { name: 'Adviser (Statistics)', description: 'Adviser' } }),
  ]);
  const roleMap = {};
  roles.forEach(r => roleMap[r.name] = r);

  // ----- Role Competency Requirements -----
  const reqs = [
    // Statistical Officer
    { role: 'Statistical Officer', comp: 'Statistical', level: 4 },
    { role: 'Statistical Officer', comp: 'Data Analysis', level: 3 },
    { role: 'Statistical Officer', comp: 'Data Visualization', level: 3 },
    { role: 'Statistical Officer', comp: 'Digital Governance', level: 2 },
    { role: 'Statistical Officer', comp: 'Leadership', level: 2 },
    // Senior Statistical Officer
    { role: 'Senior Statistical Officer', comp: 'Statistical', level: 5 },
    { role: 'Senior Statistical Officer', comp: 'Data Analysis', level: 4 },
    { role: 'Senior Statistical Officer', comp: 'Data Visualization', level: 4 },
    { role: 'Senior Statistical Officer', comp: 'Digital Governance', level: 3 },
    { role: 'Senior Statistical Officer', comp: 'Leadership', level: 3 },
    // Deputy Director
    { role: 'Deputy Director (Statistics)', comp: 'Statistical', level: 5 },
    { role: 'Deputy Director (Statistics)', comp: 'Data Analysis', level: 5 },
    { role: 'Deputy Director (Statistics)', comp: 'Data Visualization', level: 4 },
    { role: 'Deputy Director (Statistics)', comp: 'Digital Governance', level: 4 },
    { role: 'Deputy Director (Statistics)', comp: 'Leadership', level: 4 },
    // Joint Director
    { role: 'Joint Director (Statistics)', comp: 'Statistical', level: 6 },
    { role: 'Joint Director (Statistics)', comp: 'Data Analysis', level: 6 },
    { role: 'Joint Director (Statistics)', comp: 'Data Visualization', level: 5 },
    { role: 'Joint Director (Statistics)', comp: 'Digital Governance', level: 5 },
    { role: 'Joint Director (Statistics)', comp: 'Leadership', level: 5 },
    // Adviser
    { role: 'Adviser (Statistics)', comp: 'Statistical', level: 7 },
    { role: 'Adviser (Statistics)', comp: 'Data Analysis', level: 7 },
    { role: 'Adviser (Statistics)', comp: 'Data Visualization', level: 6 },
    { role: 'Adviser (Statistics)', comp: 'Digital Governance', level: 6 },
    { role: 'Adviser (Statistics)', comp: 'Leadership', level: 6 },
  ];

  for (const r of reqs) {
    await prisma.roleCompetency.create({
      data: {
        roleId: roleMap[r.role].id,
        competencyId: compMap[r.comp].id,
        requiredLevel: r.level,
      },
    });
  }

  // ----- Courses -----
  const courses = [
    { title: 'Advanced Data Analysis', skill: 'Data Analysis' },
    { title: 'Power BI Fundamentals', skill: 'Data Visualization' },
    { title: 'Leadership Essentials', skill: 'Leadership' },
    { title: 'Advanced Statistics', skill: 'Statistical' },
  ];
  for (const c of courses) {
    await prisma.course.create({
      data: {
        title: c.title,
        description: `Course on ${c.skill}`,
        competencyId: compMap[c.skill].id,
      },
    });
  }

  // ----- Users: Admin and Demo Learner -----
  const hashedPassword = await bcrypt.hash('password123', 10);
  const adminUser = await prisma.user.create({
    data: {
      employeeId: 'ADMIN-001',
      email: 'admin@mospi.gov.in',
      passwordHash: hashedPassword,
      name: 'Admin User',
      designation: 'System Administrator',
      department: 'MoSPI',
      qualification: 'M.Tech',
      role: 'ADMIN',
    },
  });

  const targetRole = roleMap['Senior Statistical Officer'];
  const learnerUser = await prisma.user.create({
    data: {
      employeeId: 'MOSPI-2024-0142',
      email: 'ananya.sharma@mospi.gov.in',
      passwordHash: hashedPassword,
      name: 'Ananya Sharma',
      designation: 'Statistical Officer',
      department: 'Ministry of Statistics & Programme Implementation',
      qualification: 'M.Sc. Statistics',
      targetRoleId: targetRole.id,
      role: 'LEARNER',
    },
  });

  // ----- User Competencies (Ananya) -----
  const userCompData = [
    { comp: 'Statistical', level: 4 },
    { comp: 'Data Analysis', level: 1 },
    { comp: 'Data Visualization', level: 2 },
    { comp: 'Digital Governance', level: 2 },
    { comp: 'Leadership', level: 1 },
  ];
  for (const uc of userCompData) {
    await prisma.userCompetency.create({
      data: {
        userId: learnerUser.id,
        competencyId: compMap[uc.comp].id,
        level: uc.level,
      },
    });
  }

  // ----- Assessment Questions -----
  const qs = [
    { comp: 'Data Analysis', question: 'What is the primary purpose of exploratory data analysis (EDA)?', options: ['To confirm hypotheses', 'To visualize and summarize data', 'To build predictive models', 'To clean data'], correct: 1 },
    { comp: 'Data Analysis', question: 'Which statistical test is used to compare means between two groups?', options: ['Chi-square', 't-test', 'ANOVA', 'Correlation'], correct: 1 },
    { comp: 'Data Visualization', question: 'Which chart is best for showing part-to-whole relationships?', options: ['Bar chart', 'Line chart', 'Pie chart', 'Scatter plot'], correct: 2 },
    { comp: 'Leadership', question: 'Which leadership style focuses on inspiring and motivating followers?', options: ['Autocratic', 'Transformational', 'Laissez-faire', 'Bureaucratic'], correct: 1 },
  ];
  for (const q of qs) {
    await prisma.assessmentQuestion.create({
      data: {
        competencyId: compMap[q.comp].id,
        question: q.question,
        options: q.options,
        correctIndex: q.correct,
      },
    });
  }

  // ----- Notifications for Ananya -----
  const notifs = [
    { icon: 'fa-graduation-cap', message: 'New course recommendation available.' },
    { icon: 'fa-exclamation-triangle', message: 'Your Data Analysis competency gap is high priority.' },
    { icon: 'fa-clipboard-list', message: 'Assessment available for Data Analysis.' },
    { icon: 'fa-road', message: 'Career pathway updated for Senior Statistical Officer.' },
  ];
  for (const n of notifs) {
    await prisma.notification.create({
      data: {
        userId: learnerUser.id,
        message: n.message,
        icon: n.icon,
        read: false,
      },
    });
  }

  // ----- Admin Demo Employees (for heatmap) -----
  const adminEmployees = [
    { name: 'Vikram Singh', dept: 'MoSPI', comps: { Statistical: 5, 'Data Analysis': 3, 'Data Visualization': 4, 'Digital Governance': 3, Leadership: 2 } },
    { name: 'Priya Patel', dept: 'MoSPI', comps: { Statistical: 3, 'Data Analysis': 2, 'Data Visualization': 1, 'Digital Governance': 2, Leadership: 3 } },
    { name: 'Rahul Mehta', dept: 'MoSPI', comps: { Statistical: 4, 'Data Analysis': 4, 'Data Visualization': 3, 'Digital Governance': 4, Leadership: 1 } },
  ];
  for (const emp of adminEmployees) {
    const user = await prisma.user.create({
      data: {
        employeeId: `EMP-${Math.random().toString(36).substring(2,8)}`,
        email: `${emp.name.toLowerCase().replace(' ', '.')}@mospi.gov.in`,
        passwordHash: hashedPassword,
        name: emp.name,
        designation: 'Statistical Officer',
        department: emp.dept,
        qualification: 'M.Sc',
        role: 'LEARNER',
      },
    });
    for (const [compName, level] of Object.entries(emp.comps)) {
      await prisma.userCompetency.create({
        data: {
          userId: user.id,
          competencyId: compMap[compName].id,
          level: level,
        },
      });
    }
  }

  // ----- Career Paths -----
  const pathSteps = [
    { from: 'Statistical Officer', to: 'Senior Statistical Officer', step: 1 },
    { from: 'Senior Statistical Officer', to: 'Deputy Director (Statistics)', step: 2 },
    { from: 'Deputy Director (Statistics)', to: 'Joint Director (Statistics)', step: 3 },
    { from: 'Joint Director (Statistics)', to: 'Adviser (Statistics)', step: 4 },
  ];
  for (const p of pathSteps) {
    await prisma.careerPath.create({
      data: {
        fromRoleId: roleMap[p.from].id,
        toRoleId: roleMap[p.to].id,
        step: p.step,
        description: `Move from ${p.from} to ${p.to}`,
      },
    });
  }

  console.log('✅ Seeding complete.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });