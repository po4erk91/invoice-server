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

const google = require("./services/google")

docx.init({
  ND_DEV_ID: "6KUUUNTG4OVAV1EH5A4ITO0E24", // goto https://developers.nativedocuments.com/ to get a dev-id/dev-secret
  ND_DEV_SECRET: "2I9VTJ5ITTUL4PPHDNVIV0488P",
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

app.get('/getGoogleFolderId', async (req, res) => {
  const folderID = await google.createFolder()
  res.send(folderID)
})

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
    await del([`${dirname}/**/*`,`invoices.zip`, 'uploads/template.docx'])
    createDirs()
    res.send('All invoices was removed!')
  });
});

app.get('/emailMessage', async (req, res) => {
  fs.exists('./message.txt', (exists) => {
    if(!exists){ res.send({message: ""}); return true}
    fs.readFile('./message.txt', 'utf8', (err, contents) => {
      if(err){
        res.send({message: ""});
      }
      res.send(JSON.parse(contents));
    });
  })
})

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
  const name = data.docxs.StaffNameEN
  carbone.render('./uploads/template.docx', data.docxs, async (err, result) => {
    if(err) handleError(err, res)
    const invoicePath = `./${name}.docx`
    fs.writeFileSync(invoicePath, result)
    google.uploadInvoices(invoicePath, data.folderID)
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
  fs.writeFileSync('./message.txt', JSON.stringify({message: data.message }))
  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: myEmail,
      pass: myPass
    }
  })
  const resp = await data.emails.map(item => {
    const message = {
      from: myEmail,
      to: item.email,
      subject: item.name,
      text: item.message,
      attachments: [{path: `./invoices/${item.name}.pdf`}]
    }
    return transport.sendMail(message,err => err)
  })
  res.send(Promise.all(resp))
};
