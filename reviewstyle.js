var ClozeReview = function() {
  document.addEventListener('click', function(e) {
    var mark = e.target.closest('.markdown-rendered mark');
    if (!mark) return;
    mark.classList.toggle('revealed');
  });
};

ClozeReview();
module.exports = ClozeReview;