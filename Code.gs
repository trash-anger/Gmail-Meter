var BATCH_SIZE = 50;
var ss = SpreadsheetApp.getActiveSpreadsheet();
// If you are using several email addresses, list them in the following variable 
// - eg 'romain.vialard@gmail.com,romain.vialard@example.com'
var aliases =  'romain.vialard@euromed-management.com';

function activityReport() {
    var status = ScriptProperties.getProperty("status");
    // If the script is triggered for the first time, init
    if (status == null) init_();
    else {
        status = Utilities.jsonParse(status);
        var previousMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).getMonth();
        if (status == null || (status.customReport == false && status.previousMonth != previousMonth)) {
            init_();
            fetchEmails_(status.customReport);
        }
        // If report not sent, continue to work on the report
        else if (status.reportSent == "no") fetchEmails_(status.customReport);
    }
}

function fetchEmails_(customReport) {
    var variables = Utilities.jsonParse(ScriptProperties.getProperty("variables"));
    if (!customReport) {
        var query = "after:" + variables.year + "/" + (variables.previousMonth + 1) + "/1";
        query += " before:" + variables.year + "/" + (variables.previousMonth + 1) + "/31";
    }
    else {
        var previousMonth = new Date(new Date().setMonth(new Date().getMonth() - 1));
        var query = "after:" + Utilities.formatDate(previousMonth, variables.userTimeZone, 'yyyy') + "/" + Utilities.formatDate(previousMonth, variables.userTimeZone, 'MM') + "/1";
        query += " before:" + Utilities.formatDate(new Date(), variables.userTimeZone, 'yyyy') + "/" + Utilities.formatDate(new Date(), variables.userTimeZone, 'MM') + "/1";
    }
    query += " in:anywhere -label:sms -label:call-log -label:chats -label:spam -filename:ics";
    query += " -from:maestro.bounces.google.com -from:unified-notifications.bounces.google.com -from:docs.google.com";
    query += " -from:group.calendar.google.com -from:apps-scripts-notifications@google.com";
    query += " -from:sites.bounces.google.com -from:noreply -from:notify -from:notification";
    var startDate = new Date(variables.startDate).getTime();
    var endDate = new Date(variables.endDate).getTime();
    var conversations = GmailApp.search(query, variables.range, BATCH_SIZE);
    variables.nbrOfConversations += conversations.length;
    var sheets = ss.getSheets();
    var people = sheets[0].getDataRange().getValues();
    var record = [];
    for (var i = 0; i < conversations.length; i++) {
        var conversationId = conversations[i].getId();
        var firstMessageSubject = conversations[i].getFirstMessageSubject();
        var starred = false;
        if (conversations[i].hasStarredMessages()) {
            variables.nbrOfConversationsStarred++;
            starred = true;
        }
        var important = false;
        if (conversations[i].isImportant()) {
            variables.nbrOfConversationsMarkedAsImportant++;
            important = true;
        }
        var location = "";
        var labels = conversations[i].getLabels();
        var nbrOfLabels = labels.length;
        if (nbrOfLabels == 0) {
            if (conversations[i].isInInbox()) {
                variables.nbrOfConversationsInInbox++;
                location += "Inbox,";
            }
            else if (conversations[i].isInTrash()) {
                variables.nbrOfConversationsInTrash++;
                location += "Trashed,";
            }
            else {
                variables.nbrOfConversationsArchived++;
                location = "Archived";
            }
        }
        else {
            variables.nbrOfConversationsInLabels++;
            for (var j = 0; j < nbrOfLabels; j++) {
                location += labels[j].getName() + ",";
            }
        }
        var youReplied = false;
        var youStartedTheConversation = false;
        var someoneAnswered = false;
        var messages = conversations[i].getMessages();
        var nbrOfMessages = messages.length;
        variables.nbrOfEmailsPerConversation[nbrOfMessages]++;
        for (var j = 0; j < 10; j++) {
            if (variables.topThreads[j][1] < nbrOfMessages) {
                variables.topThreads.splice(j, 0, [firstMessageSubject, nbrOfMessages]);
                variables.topThreads.pop();
                j = 10;
            }
        }
        var timeOfFirstMessage = 0;
        var waitingTime = 0;
        for (var j = 0; j < nbrOfMessages; j++) {
            var process = true;
            var date = messages[j].getDate();
            var month = date.getMonth();
            if (customReport) {
                if (date.getTime() < startDate || date.getTime() > endDate) process = false;
            }
            else {
                if (month != variables.previousMonth) process = false;
            }
            if (process) {
                Utilities.sleep(1000);
                //////////////////////////////////
                // Fetch sender of each emails
                //////////////////////////////////
                var from = messages[j].getFrom().replace(/"[^"]*"/g,'');
                if (from.match(/</) != null) from = from.match(/<([^>]*)/)[1];
                var time = Utilities.formatDate(date, variables.userTimeZone, "H");
                var day = Utilities.formatDate(date, variables.userTimeZone, "d") - 1;

                // Use function from Utilities file
                variables = countSendsPerDaysOfWeek_(variables, date, from);
                var body = messages[j].getBody();
                // Words count - Use function from Utilities file
                var resultsFromCalcMessagesLength = calcMessagesLength_(variables, body, from);
                variables = resultsFromCalcMessagesLength[0];
                var messageLength = resultsFromCalcMessagesLength[1];
                var cc = messages[j].getCc().replace(/"[^"]*"/g,'').split(/,/);
                for (var k = 0; k < cc.length; k++) {
                    if (cc[k].match(/</) != null) cc[k] = cc[k].match(/<([^>]*)/)[1];
                }
                var reg = new RegExp(from, 'i');
                // You have sent this msg
                if ((variables.user + aliases).search(reg) != -1) {
                    if (j == 0) {
                        youStartedTheConversation = true;
                        timeOfFirstMessage = date.getTime();
                    }
                    if (j > 0 && !youStartedTheConversation) {
                        if (!youReplied) {
                            youReplied = true;
                            // Use function from Utilities file
                            variables = calcWaitingTime_(variables, date, timeOfFirstMessage, youStartedTheConversation);
                        }
                    }
                    variables.nbrOfEmailsSent++;
                    variables.timeOfEmailsSent[time]++;
                    variables.dayOfEmailsSent[day]++;
                    if (customReport) variables.monthOfEmailsSent[month]++;
                    var sharedWithTheOutsideWorld = false;
                    var to = messages[j].getTo().replace(/"[^"]*"/g,'').split(/,/);
                    for (var k = 0; k < to.length; k++) {
                        if (to[k].match(/</) != null) to[k] = to[k].match(/<([^>]*)/)[1];
                        if (to[k].search(variables.companyname) == -1) sharedWithTheOutsideWorld = true;
                        var found = false;
                        for (var l = 0; l < people.length; l++) {
                            if (to[k] == people[l][0]) {
                                people[l][2]++;
                                found = true;
                            }
                        }
                        if (!found) people.push([to[k], 0, 1]);
                    }
                    if(!sharedWithTheOutsideWorld) variables.sharedInternally++;
                    // count Attachments
                    var attachments = messages[j].getAttachments();
                    for(k in attachments){
                      variables.nbrOfAttachmentsSent++;
                      if(!sharedWithTheOutsideWorld) variables.attachmentsSharedInternally++;
                      var name = attachments[k].getName();
                      var extension = name.substr(name.lastIndexOf('.')+1);
                      var contentType = attachments[k].getContentType();
                      if(contentType.indexOf('image') != -1) variables.attachmentsSent.images++;
                      else if(contentType.indexOf('text') != -1) variables.attachmentsSent.texts++;
                      else if(contentType.indexOf('video') != -1) variables.attachmentsSent.videos++;
                      else if(contentType.indexOf('audio') != -1) variables.attachmentsSent.audios++;
                      else if(variables.attachmentsSent[extension] != null) variables.attachmentsSent[extension]++;
                      else {
                        variables.attachmentsSent[extension] = 1;
                        if(variables.attachmentsReceived[extension] == null) variables.attachmentsReceived[extension] = 0;
                      }
                    }
                }
                // You have received this msg
                else {
                    if (j == 0) timeOfFirstMessage = date.getTime();
                    else if (youStartedTheConversation && !someoneAnswered) {
                        someoneAnswered = true;
                        // Use function from Utilities file
                        variables = calcWaitingTime_(variables, date, timeOfFirstMessage, youStartedTheConversation);
                    }
                    var found = false;
                    for (var k = 0; k < people.length; k++) {
                        if (from == people[k][0]) {
                            people[k][1]++;
                            found = true;
                        }
                    }
                    if (!found) people.push([from, 1, 0]);
                    var to = messages[j].getTo().replace(/"[^"]*"/g,'');
                    var checkSendToYou = false;
                    var aliasesTemp = new Array(variables.user).concat(aliases.split(','));
                    for(var k = 0; k < aliasesTemp.length; k++){
                        if(aliasesTemp[k] != ''){
                            var reg = new RegExp(aliasesTemp[k], 'i');
                            if (to.search(reg) != -1) checkSendToYou = true;
                        }
                    }
                    if(checkSendToYou)variables.sentDirectlyToYou++;
                    var sharedWithTheOutsideWorld = false;
                    to = to.split(/,/);
                    for (var k = 0; k < to.length; k++) {
                        if (to[k].match(/</) != null) to[k] = to[k].match(/<([^>]*)/)[1];
                        if (to[k].search(variables.companyname) == -1) sharedWithTheOutsideWorld = true;
                    }
                    if(sharedWithTheOutsideWorld == false && from.search(variables.companyname) != -1) variables.sharedInternally++;
                    variables.nbrOfEmailsReceived++;
                    variables.timeOfEmailsReceived[time]++;
                    variables.dayOfEmailsReceived[day]++;
                    if (customReport) variables.monthOfEmailsReceived[month]++;
                    // count Attachments
                    var attachments = messages[j].getAttachments();
                    for(k in attachments){
                      variables.nbrOfAttachmentsReceived++;
                      if(sharedWithTheOutsideWorld == false && from.search(variables.companyname) != -1) variables.attachmentsSharedInternally++;
                      var name = attachments[k].getName();
                      var extension = name.substr(name.lastIndexOf('.')+1);
                      var contentType = attachments[k].getContentType();
                      if(contentType.indexOf('image') != -1) variables.attachmentsReceived['images']++;
                      else if(contentType.indexOf('text') != -1) variables.attachmentsReceived.texts++;
                      else if(contentType.indexOf('video') != -1) variables.attachmentsReceived.videos++;
                      else if(contentType.indexOf('audio') != -1) variables.attachmentsReceived.audios++;
                      else if(variables.attachmentsReceived[extension] != null) variables.attachmentsReceived[extension]++;
                      else {
                        variables.attachmentsReceived[extension] = 1;
                        if(variables.attachmentsSent[extension] == null) variables.attachmentsSent[extension] = 0;
                      }
                    }
                }
                if (to != null) to = to.toString();
                if (cc != null) cc = cc.toString();
                var dayOfWeek = Utilities.formatDate(date, variables.userTimeZone, "EEEE");
                record.push([date, dayOfWeek, firstMessageSubject, from, to, cc, messageLength, location]);
            }
        }
        if (youStartedTheConversation) variables.nbrOfConversationsStartedByYou++;
        if (youReplied) variables.nbrOfConversationsYouveRepliedTo++;
    }
    variables.range += BATCH_SIZE;
    ScriptProperties.setProperty("variables", Utilities.jsonStringify(variables));
    sheets[0].getRange(1, 1, people.length, 3).setValues(people);
    if (record[0] != undefined && sheets[1].getMaxRows() < 38000) sheets[1].getRange(sheets[1].getLastRow() + 1, 1, record.length, record[0].length).setValues(record);
    if (conversations.length < BATCH_SIZE) sendReport_(variables);
}