const fs         =          require('fs');
const carbone    =     require('carbone');
const express    =     require('express');
const bodyParser = require('body-parser');
const word2pdf   =    require('word2pdf');
const path       =        require("path");
const multer     =      require('multer');
const nodemailer =  require('nodemailer');
const archiver   =    require('archiver');

const app = express();
const upload = multer({ dest: 'uploads/' });
const port = process.env.PORT || 5000;
const myEmail = 'techstack.invoice@gmail.com';
const myPass = '!23qwe456';

app.use(bodyParser.raw());
app.use(bodyParser.json());
app.use(function(req, res, next){
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE')
  res.header('Access-Control-Allow-Headers', 'origin, Content-Type')
  next()
});
app.use(bodyParser.urlencoded({ extended: true }));

app.listen(port, () => {
  console.info(`Server started on port ${port}`)
});

app.post('/create', (req, res) => {
  saveDocxFile(req.body, res)
});

app.post('/sendMail', (req, res) => {
  const data = req.body
  sendMail(data,res)
});

app.post("/upload", upload.single("template"), (req, res) => {
  const tempPath = req.file.path;
  const targetPath = path.join(__dirname, "./uploads/template.docx");
  if (path.extname(req.file.originalname).toLowerCase() === ".docx") {
    fs.rename(tempPath, targetPath, err => {
      if (err) return handleError(err, res);
      res
        .status(200)
        .contentType("text/plain")
        .end("File uploaded!");
    });
  } else {
    fs.unlink(tempPath, err => {
      if (err) return handleError(err, res);
      res
        .status(403)
        .contentType("text/plain")
        .end("Only .docx files are allowed!");
    });
  }
});

app.get('/download', async (req, res) => {
  await zipDirectory(res)
});

const zipDirectory = async (res) => {
  const archive = new archiver('zip', {
    zlib: { level: 9 }
  });
  const fileName =   'invoices.zip'
  const fileOutput = fs.createWriteStream(fileName);

  fileOutput.on('close', () => {
      console.info(archive.pointer() + ' total bytes');
      console.info('archiver has been finalized and the output file descriptor has closed.');
      res.download('./invoices.zip')
  });

  archive.pipe(fileOutput);
  archive.glob("./invoices/**/*");
  archive.on('error', function(err){
      throw err;
  });
  archive.finalize();
}

const handleError = (err, res) => {
  res
    .status(500)
    .contentType("text/plain")
    .end(JSON.stringify(err));
};

const saveDocxFile = (data, res) => {
  const name = data.StaffNameEN
  carbone.render('./uploads/template.docx', data, (err, result) => {
    if(err) handleError(err, res)
    fs.writeFileSync(`./temp-${name}.docx`, result)
    savePdfFile(res,name)
  })
};

const savePdfFile = async (res,name) => {
  const data = await word2pdf(`./temp-${name}.docx`)
  if (!fs.existsSync('./invoices')) fs.mkdirSync('./invoices');
  fs.writeFileSync(`./invoices/${name}.pdf`, data);
  fs.unlinkSync(`./temp-${name}.docx`)
  res.send('Complete!')
};

const sendMail = async (data, res) => {
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: myEmail,
      pass: myPass
    }
  })
  const resp = await data.map(item => {
    const message = {
      from: myEmail,
      to: item.email,
      subject: item.name,
      text: `Hello ${item.name}, this your invoice for this month!`,
      attachments: [{path: `./invoices/${item.name}.pdf`}]
    }
    return transport.sendMail(message,err => err)
  })
  res.send(Promise.all(resp))
};
