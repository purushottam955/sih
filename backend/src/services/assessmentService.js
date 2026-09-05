const prisma = require('../config/db');

// Generate assessment for a competency (mock generation based on existing questions)
const generateAssessment = async (competencyId) => {
  const questions = await prisma.assessmentQuestion.findMany({
    where: { competencyId },
  });
  if (questions.length === 0) {
    // fallback: create some generic questions
    return [
      { id: 'gen1', question: 'What is the main objective of statistical analysis?', options: ['To collect data', 'To infer and predict', 'To visualize', 'To clean'], correctIndex: 1 },
      { id: 'gen2', question: 'Which tool is used for data visualization?', options: ['Excel', 'Power BI', 'R', 'Python'], correctIndex: 1 },
    ];
  }
  return questions.map(q => ({
    id: q.id,
    question: q.question,
    options: q.options,
    correctIndex: q.correctIndex,
  }));
};

const submitAssessment = async (userId, answers) => {
  // answers: array of { questionId, selectedIndex }
  let correct = 0;
  for (const ans of answers) {
    const q = await prisma.assessmentQuestion.findUnique({
      where: { id: ans.questionId },
    });
    if (q && q.correctIndex === ans.selectedIndex) correct++;
  }
  const total = answers.length;
  const passed = correct / total >= 0.6;

  // Save result
  const result = await prisma.assessmentResult.create({
    data: {
      userId,
      competencyId: answers[0]?.questionId ? (await prisma.assessmentQuestion.findUnique({ where: { id: answers[0].questionId } })).competencyId : '',
      score: correct,
      total: total,
      passed,
    },
  });
  return { score: correct, total, passed, resultId: result.id };
};

module.exports = { generateAssessment, submitAssessment };