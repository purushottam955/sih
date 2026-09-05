const prisma = require('../config/db');
const upload = require('../middleware/upload');
const { generateAssessment, submitAssessment } = require('../services/assessmentService');

exports.uploadFile = upload.single('file');

exports.generate = async (req, res, next) => {
  try {
    // For now, we generate assessment for a specific competency (e.g., Data Analysis)
    // In real scenario, we'd parse file and extract competency.
    // We'll assume competencyId is passed in body or use default.
    const { competencyId } = req.body;
    if (!competencyId) {
      // Find Data Analysis competency
      const comp = await prisma.competency.findFirst({ where: { name: 'Data Analysis' } });
      if (!comp) return res.status(404).json({ success: false, message: 'Competency not found' });
      const questions = await generateAssessment(comp.id);
      return res.json({ success: true, data: { questions } });
    }
    const questions = await generateAssessment(competencyId);
    res.json({ success: true, data: { questions } });
  } catch (err) {
    next(err);
  }
};

exports.getAssessments = async (req, res, next) => {
  try {
    const results = await prisma.assessmentResult.findMany({
      where: { userId: req.user.userId },
      include: { competency: true },
    });
    res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
};

exports.getAssessment = async (req, res, next) => {
  try {
    const result = await prisma.assessmentResult.findUnique({
      where: { id: req.params.id },
      include: { competency: true },
    });
    if (!result) return res.status(404).json({ success: false, message: 'Assessment not found' });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.submit = async (req, res, next) => {
  try {
    const { answers } = req.body; // array of { questionId, selectedIndex }
    const result = await submitAssessment(req.user.userId, answers);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.getResult = async (req, res, next) => {
  try {
    const result = await prisma.assessmentResult.findUnique({
      where: { id: req.params.id },
    });
    if (!result) return res.status(404).json({ success: false, message: 'Result not found' });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};