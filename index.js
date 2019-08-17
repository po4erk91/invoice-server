const fs         =          require('fs');
const carbone    =     require('carbone');
const express    =     require('express');
const bodyParser = require('body-parser');
const path       =        require("path");
const multer     =      require('multer');
const nodemailer =  require('nodemailer');
const archiver   =    require('archiver');
const del        =         require('del');
const docx = require("@nativedocuments/docx-wasm");

const app = express();
const upload = multer({ dest: 'uploads/' });
const port = process.env.PORT || 5000;
const myEmail = 'techstack.invoice@gmail.com';
const myPass = '!23qwe456';

docx.init({
  ND_DEV_ID: "5KGCKQSN9GM2CL4GDED4RP8SCL", // goto https://developers.nativedocuments.com/ to get a dev-id/dev-secret
  ND_DEV_SECRET: "23FFG9JR34K583MEPKLDQTFQD7",
  ENVIRONMENT: "NODE",
  LAZY_INIT: true // if set to false the WASM engine will be initialized right now, usefull pre-caching (like e.g. for AWS lambda)
})
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

app.get('/reset', async (req, res) => {
  const dirname = './invoices'
  fs.readdir(dirname, async (err, files) => {
    if(err) {
      res.send('You have not generated new invoices yet...')
    }
    if (files && files.length) {
      await del([`${dirname}/**/*`,`invoices.zip`, 'uploads/template.docx'])
      createDirs()
      res.send('All invoices was removed!')
    }else{
      res.send('Invoices folder is empty!')
    }
  });
});

const createDirs = () => {
  const dir = ['./invoices','./uploads']
  dir.forEach(item => {
    if (!fs.existsSync(item)){
      fs.mkdirSync(item);
    }
  })
}
createDirs()


const zipDirectory = async (res) => {
  const archive = new archiver('zip', {
    zlib: { level: 9 }
  });
  const fileName = 'invoices.zip'
  const fileOutput = fs.createWriteStream(fileName);
  archive.pipe(fileOutput);
  archive.glob("./invoices/**/*");
  archive.on('error', function(err){
    res.status(500)
    .contentType("text/plain")
    .end(err);
    throw err;
  });
  archive.finalize();
  fileOutput.on('close', async () => {
    console.info(archive.pointer() + ' total bytes');
    console.info('archiver has been finalized and the output file descriptor has closed.');
    res.download('./invoices.zip')
  });
}

const handleError = (err, res) => {
  res
    .status(500)
    .contentType("text/plain")
    .end(JSON.stringify(err));
};

const saveDocxFile = async (data, res) => {
  const name = data.StaffNameEN
  carbone.render('./uploads/template.docx', data, (err, result) => {
    if(err) handleError(err, res)
    fs.writeFileSync(`./${name}.docx`, result)
    savePdfFile(res,name)
  })
};

const savePdfFile = async (res,name) => {
  async function convertHelper(document, exportFct) {
    const api = await docx.engine();
    await api.load(document);
    const arrayBuffer = await api[exportFct]();
    await api.close();
    return arrayBuffer;
  }
  convertHelper(`./${name}.docx`, "exportPDF").then((arrayBuffer) => {
    fs.writeFileSync(`./invoices/${name}.pdf`, new Uint8Array(arrayBuffer));
  }).then(() => {
    fs.unlinkSync(`./${name}.docx`)
    res.send('Complete!')
  }).catch((e) => {
      console.error(e);
  });
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
