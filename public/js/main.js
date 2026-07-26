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

document.querySelectorAll('.new-token-button').forEach((button) => {
  button.addEventListener('click', () => {
    const form = document.querySelector('#newTokenForm');
    const patientLabel = document.querySelector('#newTokenPatient');
    const physicianSelect = document.querySelector('#repeatConsultant');
    const description = document.querySelector('#repeatDescription');
    const patientType = document.querySelector('#repeatPatientType');

    form.action = `/patients/${button.dataset.patientId}/revisit`;
    patientLabel.textContent = `${button.dataset.mrNumber} · ${button.dataset.patientName}`;
    physicianSelect.value = button.dataset.physicianId || '';
    patientType.value = 'Follow-up';
    description.value = '';
  });
});

document.querySelectorAll('form[method="post"]').forEach((form) => {
  form.addEventListener('submit', (event) => {
    if (event.defaultPrevented) return;

    const submitButtons = form.querySelectorAll('button[type="submit"], input[type="submit"]');
    submitButtons.forEach((button) => {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');

      if (button.tagName === 'BUTTON') {
        button.dataset.originalHtml = button.innerHTML;
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> Please wait...';
      }
    });
  });
});
