// todo
const button = document.createElement("button");
button.innerHTML = "Button";
document.body.append(button);

button.addEventListener("click", () => {
  alert("you clicked the button");
});
