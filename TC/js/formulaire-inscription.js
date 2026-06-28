const initInscriptionForm = () => {
  const form = document.getElementById('inscriptionForm');
  const status = document.getElementById('formStatus');
  if (!form || !status) return;

  const markFilled = (element) => {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const isFilled = element.value.trim() !== '';
      element.classList.toggle('border-amber-400', isFilled);
      element.classList.toggle('bg-amber-50', isFilled);
    }
  };

  form.querySelectorAll('input, textarea').forEach((element) => {
    markFilled(element);
    element.addEventListener('input', () => markFilled(element));
    element.addEventListener('change', () => markFilled(element));
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const requiredFields = ['nom', 'telephone1'];
    const missing = requiredFields.filter((fieldName) => {
      const field = form.elements[fieldName];
      return !field || field.value.trim() === '';
    });

    if (missing.length) {
      status.textContent = 'Please enter at least your full name and primary phone number.';
      status.className = 'min-h-6 text-sm font-semibold text-red-600';
      return;
    }

    const data = new FormData(form);
    const summary = [];

    for (const [key, value] of data.entries()) {
      if (value && value.trim() !== '') {
        summary.push(`${key}: ${value}`);
      }
    }

    status.textContent = `Form ready to be submitted. ${summary.length} field(s) completed.`;
    status.className = 'min-h-6 text-sm font-semibold text-emerald-600';
  });
};

// Auto-init when used as a standalone page
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initInscriptionForm);
} else {
  initInscriptionForm();
}

// Expose for dynamic initialization after modal injection
window.initInscriptionForm = initInscriptionForm;

