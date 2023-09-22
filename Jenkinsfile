pipeline {
    agent any
    
    stages{
        stage('GetCode'){
            steps{
               git branch: 'main', url: 'https://github.com/StelioPortugal/Cinema-App.git'
                
            }
        }
        stage('Stop and Remove Existing Container'){
        steps{
            sh 'docker stop myapp'
            sh 'docker rm myapp'
        }
            
        }
        stage('Build Docker Image'){
            steps{
                  sh 'pwd'
                  sh 'ls'
                  
                  sh 'docker build . -t myapp'
                 
              

                
            }
        }
         stage('Run Docker Container'){
          steps {
               sh 'docker run -p 80:3000 -d --name myapp myapp'
          }   
         }
    
      
        
    }
}
