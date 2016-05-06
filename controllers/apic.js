/**
 * GET /
 * apic page.
 */
exports.apic = function(req, res) {
  res.render('apic', {
    title: 'Apic'
  });
};
