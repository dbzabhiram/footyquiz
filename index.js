const Alexa = require('ask-sdk-core');
const ddbAdapter = require('ask-sdk-dynamodb-persistence-adapter'); // included in ask-sdk
const ddbTableName = 'footy-quiz-table';


const WELCOME_MSG = 'Welcome to Footy Quiz! I will ask you some questions regarding football. Are you ready?';
const HELP_MSG = 'I will ask you some questions regarding football. Are you ready?';

/*Required Handlers
** 1. LaunchRequestHandler:         Helping out the opening request
** 2. HelpHandler:                  Helping out in case of any help required
** 3. CancelAndStopHandler:         In case of stopping or canceling input, the skill automatically stops
** 4. SessionEndedRequestHandler:   Session ended if inputs like 'Quit' is used. Data is saved to the Database
** 5. ErrorHandler:                 In case of any random or no input, error handler takes care.
*/

/* Custom Handlers
** 1. AnswerHandler:    To check answer and move to next question.
** 2. QuestionHandler:  To read a question from the questionnaire.
** 3. ContinueHandler:  When coming back to the game from quit, this handler is asked to activated or not.
*/

const LaunchRequestHandler = {
    canHandle(handlerInput){
        return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
    },
    async handle(handlerInput){
        const speechOutput = WELCOME_MSG;
        const repromptOutput = HELP_MSG;
        
        const { attributesManager } = handlerInput;
        const attributes = await attributesManager.getPersistentAttributes(handlerInput.requestEnvelope) || {};
        
        if(attributes.currentIndex > 0){
            var back = 'Welcome back! Do you want to continue with your previous session or restart?';
            var reprompt = 'Continue or restart?';

            handlerInput.attributesManager.setSessionAttributes(attributes);
            
            return handlerInput.responseBuilder
                .speak(back)
                .reprompt(reprompt)
                .getResponse();
        }
        
        return handlerInput.responseBuilder
                .speak(speechOutput)
                .reprompt(repromptOutput)
                .getResponse();
    }
};

const QuestionHandler = {
    canHandle(handlerInput) {
      return handlerInput.requestEnvelope.request.type === 'IntentRequest' 
        && (handlerInput.requestEnvelope.request.intent.name === 'StartQuizIntent'
        || handlerInput.requestEnvelope.request.intent.name === 'AMAZON.YesIntent'
        || handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StartOverIntent');
    },
    handle(handlerInput){
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        
        attributes.currentIndex = 0;
        attributes.currentScore = 0;
        attributes.questionBank = shuffle(questions);
        
        handlerInput.attributesManager.setSessionAttributes(attributes);
        
        var question = AskQuestion(attributes);
        var speechStart = 'The quiz will be starting now. Here is your first question. ' + question;
        
        return handlerInput.responseBuilder
                .speak(speechStart)
                .reprompt(question)
                .getResponse();
    }
};

const ContinueHandler = {
    canHandle(handlerInput){
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'ContinueIntent';
    },
    handle(handlerInput){
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        
        var question = AskQuestion(attributes);
        var speechStart = 'Here is your next question. ' + question;
        
        return handlerInput.responseBuilder
            .speak(speechStart)
            .reprompt(question)
            .getResponse();
    }
};

const AnswerHandler = {
    canHandle(handlerInput){
        return handlerInput.requestEnvelope.request.type === 'IntentRequest' 
            && handlerInput.requestEnvelope.request.intent.name === 'AnswerIntent';
    },
    async handle(handlerInput){
        const attributes = handlerInput.attributesManager.getSessionAttributes();
        const givenAnswer = handlerInput.requestEnvelope.request.intent.slots.answer.value.toLowerCase();
        
        const currentQuestions = attributes.questionBank;
        const currentIndex = attributes.currentIndex;
        const correctAnswer = currentQuestions[currentIndex].answer;
        const explanation = currentQuestions[currentIndex].explanation;
        const totalQuestions = currentQuestions.length;
        
        var outputSpeech = '';

        if(correctAnswer.indexOf(givenAnswer) > -1){
            outputSpeech = answerGreetings[0][currentIndex] + ' ' + givenAnswer + ' is correct! ' + explanation;
            attributes.currentScore += 1;
        } else {
            var end; 
            if(Array.isArray(correctAnswer)) end = correctAnswer[0] + '. ' + explanation;
            else end = correctAnswer + '. ' + explanation;
            outputSpeech = answerGreetings[1][currentIndex] + ' ' + givenAnswer + ' is not correct. The right answer is ' + end;
        }

        attributes.currentIndex += 1;

        if(attributes.currentIndex >= totalQuestions){
            outputSpeech = outputSpeech + ' Now the quiz ends. Your final score is ' + attributes.currentScore + ' out of ' + totalQuestions + '. Thank you for your participation. Take care!';
            
            const { attributesManager } = handlerInput;
            const sessionAttributes = attributesManager.getSessionAttributes();
            
            sessionAttributes.currentIndex = 0;
            sessionAttributes.currentScore = 0;
            
            attributesManager.setPersistentAttributes(sessionAttributes);
            await attributesManager.savePersistentAttributes();
            
            return handlerInput.responseBuilder
                    .speak(outputSpeech)
                    .getResponse();
        }

        outputSpeech = outputSpeech + ' Your current score is ' + attributes.currentScore + ' out of ' + totalQuestions + '. Next question is ';
        
        handlerInput.attributesManager.setSessionAttributes(attributes);
        
        var nextQuestion = AskQuestion(attributes);
         
        return handlerInput.responseBuilder
                .speak(outputSpeech + nextQuestion)
                .reprompt(nextQuestion)
                .getResponse();
    }
};

const HelpHandler = {
    canHandle(handlerInput){
        return handlerInput.requestEnvelope.request.type === 'IntentRequest' 
            && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.HelpIntent';
    },
    handle(handlerInput){
        const speechOutput = 'Give answers and have fun!';

        return handlerInput.responseBuilder
                .speak(speechOutput)
                .getResponse();
    }
};

const CancelAndStopHandler = {
    canHandle(handlerInput){
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && (handlerInput.requestEnvelope.request.intent.name === 'AMAZON.CancelIntent'
            || handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StopIntent');
    },
    async handle(handlerInput){
        const speakOutput = 'Goodbye!';
        
        const { attributesManager } = handlerInput;
        const sessionAttributes = attributesManager.getSessionAttributes();
        
        attributesManager.setPersistentAttributes(sessionAttributes);
        
        await attributesManager.savePersistentAttributes(handlerInput.requestEnvelope, sessionAttributes);

        return handlerInput.responseBuilder
                .speak(speakOutput)
                .getResponse();
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput){
        return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
    },
    handle(handlerInput){
        console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);

        return handlerInput.responseBuilder.getResponse();
    }
};

const ErrorHandler = {
    canHandle(){
        return true;
    },
    handle(handlerInput, error){
        console.log(`Error handled: ${error.message}`);
        console.log(error.trace);

        return handlerInput.responseBuilder
                .speak('Sorry, I can\'t understand the command. Please say again.')
                .getResponse();
    }
};

/* Functions/Methods
** 1. AskQuestion():            This method is used to take question from the questionnaire
** 2. shuffle():                To shuffle the questions
** 3. getPersistenceAdapter():  This helps in shifting the adapter from dynamoDB to S3 incase the environment supports S3 storage.
*/

var AskQuestion = function(attributes) {
    var currentIndex = attributes.currentIndex;
    
    var question = attributes.questionBank[currentIndex].question;
    var options = attributes.questionBank[currentIndex].options;

    return question + ' And the options are ' + options;
};

function shuffle(arr) {
    var ctr = arr.length, temp, index;
    while(ctr > 0){
        index = Math.floor(Math.random() * ctr);
        ctr--;
        temp = arr[ctr];
        arr[ctr] = arr[index];
        arr[index] = temp;
    }
    return arr;
}

function getPersistenceAdapter(tableName) {
    // Determines persistence adapter to be used based on environment
    // Note: tableName is only used for DynamoDB Persistence Adapter
    if (process.env.S3_PERSISTENCE_BUCKET) {
      // in Alexa Hosted Environment
      // eslint-disable-next-line global-require
      const s3Adapter = require('ask-sdk-s3-persistence-adapter');
      return new s3Adapter.S3PersistenceAdapter({
        bucketName: process.env.S3_PERSISTENCE_BUCKET,
      });
    }
  
    // Not in Alexa Hosted Environment
    return new ddbAdapter.DynamoDbPersistenceAdapter({
      tableName: tableName,
      createTable: true,
    });
}
  

/* Resources 
** 1. questionnaire
** 2. answerGreetings
*/

var questions = [
    {
        question: 'Which country is most successful in winning the FIFA World Cup?',
        options: 'France, England, Brazil, Germany',
        answer: 'brazil',
        explanation: 'Brazil have won it 5 times, followed by Italy and Germany both with tally of 4.'
    },
    {
        question: 'Who is the currently top scorer in FIFA International Matches?',
        options: 'Cristiano Ronaldo, Lionel Messi, Ali Daei, Ronaldinho',
        answer: ['ali daei', 'ali', 'daei'],
        explanation: 'Ali Daei has scored 109 International goals, followed by Cristiano Ronaldo(95). Messi has 68 goals.'
    },
    {
        question: 'Which player recently won the FIFA Best Player in 2019?',
        options: 'Virgil van Dijk, Lionel Messi, Cristiano Ronaldo, Neymar',
        answer: ['lionel messi','leo','messi','lionel'],
        explanation: 'Lionel Messi won the award for sixth time, matching with Cristiano Ronaldo.'
    },
    {
        question: 'Which player scored the infamous \'Hand of God\' goal against England in 1986?',
        options: 'Diego Maradona, Socrates, Michel Platini, Johan Cruyff',
        answer: ['diego maradona', 'diego', 'maradona'],
        explanation: 'Diego Maradona scored this goal in the quarter-final of the 1986 FIFA World Cup, which he won with Argentina.'
    },
    {
        question: 'Anfield is home to which famous English Premier League club?',
        options: 'West Ham United, Chelsea, Manchester City, Liverpool',
        answer: 'liverpool',
        explanation: 'Anfield is stadium of Liverpool since 1892, having capacity of 54072.'
    }
];

var answerGreetings = [
    //Correct answer greetings
    [   
        'Great!', 
        'Right!', 
        'Alright!', 
        'Correct!', 
        'Oh great!'
    ],

    //Wrong answer greetings
    [   
        'Oh no!', 
        'Sadly', 
        'Oh dude!', 
        'Unfortunately', 
        'Oops!'
    ]
];

const skillBuilder = Alexa.SkillBuilders.custom();

exports.handler = skillBuilder
    .withPersistenceAdapter(getPersistenceAdapter(ddbTableName))
	.addRequestHandlers(
        LaunchRequestHandler,
        QuestionHandler,
        ContinueHandler,
        AnswerHandler,
		HelpHandler,
		CancelAndStopHandler,
		SessionEndedRequestHandler
    )
    .addErrorHandlers(ErrorHandler)
	.lambda();