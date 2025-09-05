export const testingGet = (req, res) => {
  res.json({ message: "Working" });
};

export const testingPut = (req, res) => {
  const data = req.body;
  res.json({ message: "Data Received", data });
};
