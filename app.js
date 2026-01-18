async function loadRecipes() {
  const response = await fetch('data/recipes.json');
  const recipes = await response.json();
  return recipes;
}

function runCalculator() {
  const item = document.getElementById('itemSelect').value;
  const rate = parseFloat(document.getElementById('rateInput').value);
  document.getElementById('results').innerText = `Calculating ${rate} units/min of ${item}...`;
  // TODO: Add logic here
}

async function init() {
  const recipes = await loadRecipes();
  const itemSelect = document.getElementById('itemSelect');
  Object.keys(recipes).forEach(item => {
    const option = document.createElement('option');
    option.value = item;
    option.textContent = item;
    itemSelect.appendChild(option);
  });
}

init();
