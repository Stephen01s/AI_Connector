// Initialize the local role UI independently of the Firebase module imports.
(() => {
    const roleSelects = document.querySelectorAll('[data-custom-role-input]');

    function getRoleValue(selector, fallback = '') {
        const select = document.querySelector(selector);
        const value = select.value === 'custom'
            ? document.getElementById(select.dataset.customRoleInput).value.trim()
            : select.value.trim();
        return value && value !== 'Select a role...' ? value : fallback;
    }

    function updateCustomRoleField(select) {
        const input = document.getElementById(select.dataset.customRoleInput);
        const isCustom = select.value === 'custom';
        input.closest('[data-custom-role-field]').hidden = !isCustom;
        input.disabled = !isCustom;
        input.required = isCustom;
        input.setCustomValidity('');
    }

    function updateModelCards() {
        for (const [model, defaultName, defaultRole] of [
            ['a', 'Model A', 'Proposer'],
            ['b', 'Model B', 'Critic']
        ]) {
            const name = document.querySelector('#model-' + model + '-name').value.trim();
            const role = getRoleValue('#model-' + model + '-role', defaultRole);
            document.querySelector('#model-' + model + '-card-name').textContent =
                name || defaultName;
            document.querySelector('#model-' + model + '-card-role').textContent =
                '(' + role + ')';
        }
    }

    roleSelects.forEach(select => {
        const input = document.getElementById(select.dataset.customRoleInput);
        updateCustomRoleField(select);

        function onRoleSelection() {
            updateCustomRoleField(select);
            updateModelCards();
        }

        select.addEventListener('input', onRoleSelection);
        select.addEventListener('change', () => {
            onRoleSelection();
            if (select.value === 'custom') input.focus();
        });
        input.addEventListener('input', () => {
            input.setCustomValidity('');
            updateModelCards();
        });
    });

    ['#model-a-name', '#model-b-name'].forEach(selector => {
        const input = document.querySelector(selector);
        input.addEventListener('input', updateModelCards);
        input.addEventListener('change', updateModelCards);
    });

    // Restore visibility if the browser restores selections on refresh/back.
    window.addEventListener('pageshow', () => {
        roleSelects.forEach(updateCustomRoleField);
        updateModelCards();
    });
    updateModelCards();

    window.roleControls = {getRoleValue, updateModelCards};
})();
