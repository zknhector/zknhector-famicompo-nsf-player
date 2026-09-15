/*
 Chromebook-Famicompo-NSF-Player

 gme-core.js v1.0

 libgme core interface

*/


const GMECore = {


    module:null,

    emulator:null,

    ready:false,





    /*
      初期化
    */

    async init(){


        console.log(
            "GME Core initialize"
        );



        if(
            window.Module
        ){


            this.module =
                window.Module;



            this.ready=true;



            console.log(
                "GME Core ready"
            );


            return true;


        }



        console.warn(
            "Emscripten Module waiting"
        );



        return false;


    },








    /*
      NSFオープン

    */

    open(buffer){



        if(
            !this.ready
        ){


            console.warn(
                "GME not ready"
            );


            return false;

        }




        /*
          本接続予定:

          gme_open_data(
             data,
             length,
             &emu
          )

        */



        this.emulator =
        {

            data:buffer,

            track:0


        };



        console.log(
            "NSF opened"
        );



        return true;


    },








    /*
      トラック開始

    */

    startTrack(track){



        if(
            !this.emulator
        ){

            return false;

        }



        this.emulator.track =
            track;



        /*
          gme_start_track()

        */



        console.log(
            "Track start",
            track
        );



        return true;


    },








    /*
      PCM取得

    */

    getSamples(length){



        /*
          gme_play()

        */



        return new Int16Array(
            length
        );


    },








    /*
      停止

    */

    stop(){



        this.emulator =
            null;



    }





};





window.GMECore =
    GMECore;
