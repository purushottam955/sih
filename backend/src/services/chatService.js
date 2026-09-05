const prisma = require('../config/db');
const { getGaps } = require('./competencyService');
const { getRecommendedCourses } = require('./recommendationService');

// Mock RAG retrieval (keyword matching on a knowledge base)
const knowledgeBase = [
  'Statistical Officer requires Statistical level 4, Data Analysis level 3, Data Visualization level 3, Digital Governance level 2, Leadership level 2.',
  'Senior Statistical Officer requires Statistical level 5, Data Analysis level 4, Data Visualization level 4, Digital Governance level 3, Leadership level 3.',
  'Ananya Sharma has Statistical level 4, Data Analysis level 1, Data Visualization level 2, Digital Governance level 2, Leadership level 1.',
  'Advanced Data Analysis teaches Data Analysis. Power BI Fundamentals teaches Data Visualization. Leadership Essentials teaches Leadership. Advanced Statistics teaches Statistical.',
  'To become Senior Statistical Officer, you need to close gaps in Data Analysis (gap 2), Data Visualization (gap 1), and Leadership (gap 1).',
];

const retrieveContext = (query) => {
  const q = query.toLowerCase();
  const results = knowledgeBase.filter(item => item.toLowerCase().includes(q) ||
    q.split(' ').some(word => item.toLowerCase().includes(word)));
  return results.length ? results.join(' ') : null;
};

const generateResponse = async (userId, message) => {
  const msg = message.toLowerCase();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { targetRole: true },
  });
  if (!user) return 'User not found.';

  const targetRoleId = user.targetRoleId;
  const { gaps } = await getGaps(userId, targetRoleId);
  const recs = await getRecommendedCourses(userId, targetRoleId);

  let response = '';

  if (msg.includes('skill gap') || msg.includes('biggest gap')) {
    let highest = null;
    let highestComp = '';
    for (const [comp, data] of Object.entries(gaps)) {
      if (data.gap > 0 && (!highest || data.gap > highest)) {
        highest = data.gap;
        highestComp = comp;
      }
    }
    if (highestComp) {
      response = `Your biggest gap is ${highestComp}, where your current level is ${gaps[highestComp].current} and the required level is ${gaps[highestComp].required}. This creates a gap of ${highest} levels.`;
    } else {
      response = 'You have no competency gaps. Great job!';
    }
  } else if (msg.includes('learn next') || msg.includes('recommend')) {
    if (recs.length > 0) {
      const top = recs[0];
      response = `I recommend you start with "${top.title}" which addresses ${top.skill} (gap ${top.gap} levels). ${top.reason}`;
    } else {
      response = 'You are fully aligned with your target role. No additional courses needed at this time.';
    }
  } else if (msg.includes('why') && (msg.includes('course') || msg.includes('recommended'))) {
    let courseFound = null;
    for (const c of recs) {
      if (msg.includes(c.title.toLowerCase()) || msg.includes(c.skill.toLowerCase())) {
        courseFound = c;
        break;
      }
    }
    if (courseFound) {
      response = `The recommendation for "${courseFound.title}" is based on your competency gap in ${courseFound.skill}. Required level: ${courseFound.required}, your current level: ${courseFound.current}, gap: ${courseFound.gap}. ${courseFound.reason}`;
    } else {
      response = 'I can explain any course recommendation. Please mention a specific course like "Advanced Data Analysis".';
    }
  } else if (msg.includes('senior statistical officer') || msg.includes('target role') || msg.includes('become')) {
    const target = user.targetRole ? user.targetRole.name : 'Senior Statistical Officer';
    let gapSummary = '';
    for (const [comp, data] of Object.entries(gaps)) {
      if (data.gap > 0) gapSummary += ` ${comp} (gap ${data.gap}),`;
    }
    if (gapSummary) {
      gapSummary = gapSummary.slice(0, -1);
      response = `To become a ${target}, you need to close gaps in:${gapSummary}. I recommend starting with the highest priority course.`;
    } else {
      response = `You already meet all competency requirements for ${target}. Consider exploring higher roles.`;
    }
  } else {
    const context = retrieveContext(msg);
    if (context) {
      response = context;
    } else {
      response = 'I can help with questions about your skill gaps, course recommendations, career progression, or the explainability trail. Try one of the suggested prompts.';
    }
  }
  return response;
};

module.exports = { generateResponse };