
document.addEventListener("DOMContentLoaded", () => {
    const moodChartCtx = document.getElementById("moodChart").getContext("2d");

    const dates = JSON.parse(document.getElementById("datesData").textContent);
    const moodData = JSON.parse(document.getElementById("moodData").textContent);

    new Chart(moodChartCtx, {
        type: "line",
        data: {
            labels: dates,  
            datasets: [{
                label: "Mood Over Time",
                data: moodData,  
                borderColor: "rgba(75, 192, 192, 1)",
                borderWidth: 2,
                fill: false
            }]
        },
        options: {
            scales: {
                x: { title: { display: true, text: "Date" } },
                y: { title: { display: true, text: "Mood" } }
            }
        }
    });
});
