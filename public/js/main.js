document.querySelectorAll('.delete-form').forEach((form) => {
  form.addEventListener('submit', (event) => {
    if (!window.confirm('Are you sure you want to delete this record?')) {
      event.preventDefault();
    }
  });
});

const cnicInput = document.querySelector('#cnic');
if (cnicInput) {
  const formatCnic = () => {
    const digits = cnicInput.value.replace(/\D/g, '').slice(0, 13);
    let formatted = digits.slice(0, 5);
    if (digits.length > 5) formatted += `-${digits.slice(5, 12)}`;
    if (digits.length > 12) formatted += `-${digits.slice(12)}`;
    cnicInput.value = formatted;
  };

  cnicInput.addEventListener('input', formatCnic);
  formatCnic();
}
