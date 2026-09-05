const prisma = require('../config/db');
const { getRecommendedCourses } = require('../services/recommendationService');

exports.getAllCourses = async (req, res, next) => {
  try {
    const courses = await prisma.course.findMany({ include: { competency: true } });
    res.json({ success: true, data: courses });
  } catch (err) {
    next(err);
  }
};

exports.getRecommended = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { targetRoleId: true },
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const recs = await getRecommendedCourses(req.user.userId, user.targetRoleId);
    res.json({ success: true, data: recs });
  } catch (err) {
    next(err);
  }
};

exports.getCourse = async (req, res, next) => {
  try {
    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
      include: { competency: true },
    });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    res.json({ success: true, data: course });
  } catch (err) {
    next(err);
  }
};

exports.enroll = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const existing = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: req.user.userId, courseId } },
    });
    if (existing) return res.status(400).json({ success: false, message: 'Already enrolled' });
    const enrollment = await prisma.enrollment.create({
      data: { userId: req.user.userId, courseId },
    });
    res.json({ success: true, data: enrollment });
  } catch (err) {
    next(err);
  }
};

exports.getExplainability = async (req, res, next) => {
  try {
    const courseId = req.params.courseId;
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: { competency: true },
    });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { targetRoleId: true },
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const { gaps } = require('../services/competencyService').getGaps(req.user.userId, user.targetRoleId);
    const compName = course.competency.name;
    const gapData = gaps[compName];
    if (!gapData || gapData.gap <= 0) {
      return res.status(400).json({ success: false, message: 'No gap for this competency' });
    }
    const severity = require('../services/competencyService').getSeverity(gapData.gap);
    const trail = {
      course: course.title,
      competency: compName,
      required: gapData.required,
      current: gapData.current,
      gap: gapData.gap,
      priority: severity.label,
      steps: [
        { label: 'Employee competency', value: `${compName}: Level ${gapData.current}` },
        { label: 'Required competency level', value: `${compName}: Level ${gapData.required}` },
        { label: 'Current assessed level', value: `Level ${gapData.current}` },
        { label: 'Gap calculation', value: `${gapData.required} − ${gapData.current} = ${gapData.gap}` },
        { label: 'Priority', value: severity.label },
        { label: 'Matching competency', value: compName },
        { label: 'Recommended course', value: course.title },
      ],
      finalReason: `This course directly addresses the employee's ${compName} competency gap of ${gapData.gap} level(s).`,
    };
    res.json({ success: true, data: trail });
  } catch (err) {
    next(err);
  }
};