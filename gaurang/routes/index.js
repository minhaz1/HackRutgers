
/*
 * GET home page.
 */

exports.index = function(req, res){
  res.render('index', { title: 'Express' });
};

exports.newuser = function(req, res){
  res.render('newuser', { title: 'Add New User' });
};

exports.helloworld = function(req, res){
  res.render('helloworld', { title: 'Hello, World!' });
};

exports.test = function(req, res){
  res.render('employee_new', { title: 'Hello, World!' });
};

exports.userlist = function(db) {
    return function(req, res) {
        var collection = db.get('users');
        collection.find({},{},function(e,docs){
            res.render('userlist', {
                "userlist" : docs
            });
        });
    };
};

exports.adduser = function(db) {
    return function(req, res) {
        // Get our form values. These rely on the "name" attributes
		var fname = req.body.fname;
		var lname = req.body.lname;
		var email = req.body.email;
        var userName = req.body.username;
        var userPass = req.body.password;
		var secPass = req.body.re_password;
		var canAdd = true;

		if(email.indexOf(".edu") < 3) {
			 canAdd = false;
			 res.send("<h1>No psfdasdfsdfasdfasdfsadfsaDassword set</h1>");
		}
		else if(userPass == ""){
			 canAdd = false;
			 res.send("<h1>No password set</h1>");
		}else
		if(userPass != secPass){
			 canAdd = false;
			 res.send("<h1>PASSWORDS DON'T MATCH</h1>");
		}
		
		if(canAdd){
			// Set our collection
			var collection = db.get('users');
			
			// Submit to the DB
			collection.insert({
				"fname" : fname,
				"lname" : lname,
				"email" : email,
				"username" : userName,
				"password" : userPass
				
			}, function (err, doc) {
				if (err) {
					// If it failed, return error
					res.send("The username probably already exists");
				}
				else {
					// If it worked, forward to success page
					res.redirect("userlist");
					// And set the header so the address bar doesn't still say /adduser
					res.location("userlist");
				}
			});
		}
    }
}