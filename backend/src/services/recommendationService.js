const prisma = require('../config/db');
const { getGaps } = require('./competencyService');

const getRecommendedCourses = async (userId, targetRoleId) => {
  const { gaps } = await getGaps(userId, targetRoleId);
  const courses = await prisma.course.findMany({
    include: { competency: true },
  });

  const recommended = [];
  for (const course of courses) {
    const compName = course.competency.name;
    if (gaps[compName] && gaps[compName].gap > 0) {
      const gapData = gaps[compName];
      recommended.push({
        id: course.id,
        title: course.title,
        description: course.description,
        skill: compName,
        gap: gapData.gap,
        required: gapData.required,
        current: gapData.current,
        reason: `Addresses ${compName} competency gap of ${gapData.gap} level(s).`,
      });
    }
  }
  recommended.sort((a, b) => b.gap - a.gap);
  return recommended;
};

module.exports = { getRecommendedCourses };