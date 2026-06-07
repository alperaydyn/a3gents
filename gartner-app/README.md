# Context
This document is a description for a web scraping task.
You will scrape Gartner website. If authentication is required use the credentials:
username: alperayd@garantibbva.com.tr
password: Grtnr!23

# Tasks:
Below are the tasks:

## Task 1:
create a python script to collect the meetings information provided at gartner's website https://cn.gartner.com/BIE27I/fullagenda?ref=hp-wcu and store it in a csv file.

columns: 
- Session ID
- Session Title
- Date
- Time
- Location
- Files url
- My Attendance Status
- session_day: div with class_name="session_day" id="05/11/2026" (MM/DD/YYYY format), take the day part only.
- session_order: the element order in its parent container

## Task 2:
After storing all events in the index page visit the links one by one and read the session details, save the details in a markdown file for each session.

session details:
- https://cn.gartner.com/BIE27I/sessiondetails/{session_id}

markdown naming format:
D{session_day}_{session_order}_{session_hour_HHMM}_{session_title}.md


