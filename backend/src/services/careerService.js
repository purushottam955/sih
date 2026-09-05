const prisma = require('../config/db');
const { getGaps } = require('./competencyService');
const { getRecommendedCourses } = require('./recommendationService');

const getCareerPath = async (userId, fromRoleId, toRoleId) => {
  // Get the path steps from db (order)
  const pathSteps = await prisma.careerPath.findMany({
    where: { fromRoleId, toRoleId },
    orderBy: { step: 'asc' },
  });
  // Get gaps and recommendations for the target role
  const { gaps } = await getGaps(userId, toRoleId);
  const recs = await getRecommendedCourses(userId, toRoleId);

  // Build learning path: each step corresponds to a recommended course, then reassessment
  const learningSteps = recs.map((r, idx) => ({
    step: idx + 1,
    action: `Take course: ${r.title}`,
    description: r.reason,
  }));
  learningSteps.push({
    step: learningSteps.length + 1,
    action: 'Reassessment',
    description: 'Re-evaluate competencies after completing courses.',
  });

  return {
    targetRole: (await prisma.role.findUnique({ where: { id: toRoleId } })).name,
    currentRole: (await prisma.role.findUnique({ where: { id: fromRoleId } })).name,
    gaps,
    recommendedCourses: recs,
    learningPath: learningSteps,
  };
};

module.exports = { getCareerPath };