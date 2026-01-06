import express from 'express';
const app = express();
const PORT = 3000;

app.get('/', (req, res) => res.send('Lite Server Works!'));

app.listen(PORT, () => {
    console.log(`Lite server running on ${PORT}`);
});
